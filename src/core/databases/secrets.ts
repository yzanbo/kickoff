// DB のパスワード（DB・AI 用のユーザー・SSH）の置き方: いつもキーチェーンの鍵（Electron の safeStorage）で暗号化して secrets に置く。
// AI がパスワードを知ると psql などで直接 DB に入れ、AI のツールの守りが素通りになるため（要件 5.12）。
// 暗号化の口はメインプロセスが startCore に渡す（コアは Electron に依らない）。口のない単体のコア・テストは暗号化せずに置く（予備）
import { DB_PASSWORD_LOCKED } from "@shared/types";
import { errorMessage } from "@shared/errors";
import type { Store } from "../db/store.js";
import type { DbSecretKey } from "../db/settings.js";
import { dbAiPasswordKey, dbPasswordKey, dbSshPasswordKey } from "../db/dbConnections.js";
import { Conflict, Invalid } from "../http/errors.js";

/** 暗号化と復号（Electron の safeStorage の非同期の口。キーチェーンの許可を待つ間もメインプロセスを止めない） */
export interface SecretCipher {
  /** 暗号化した値（base64） */
  encrypt(plain: string): Promise<string>;
  /** 暗号化した値（base64）から元の値。キーチェーンで拒否されたら失敗 */
  decrypt(sealed: string): Promise<string>;
}

/** 暗号化した値の頭の印（印のない値は、暗号化せずに置いたもの） */
const SEALED = "safe:v1:";

export const DB_SECRET_KINDS = ["password", "ai_password", "ssh_password"] as const;
export type DbSecretKind = (typeof DB_SECRET_KINDS)[number];

const KEY_OF: Record<DbSecretKind, (id: number) => DbSecretKey> = {
  password: dbPasswordKey,
  ai_password: dbAiPasswordKey,
  ssh_password: dbSshPasswordKey,
};

/** パスワードの欄（undefined はそのまま・null と空は消す） */
type PasswordFields = Partial<Record<DbSecretKind, string | null>>;

/** キーチェーンで開けなかったときの失敗（409。画面がその場でパスワードを聞く） */
export class DbPasswordLocked extends Conflict {
  constructor(name: string) {
    super(`「${name}」の保存したパスワードを読めませんでした（キーチェーンで許可されませんでした）`, DB_PASSWORD_LOCKED);
  }
}

export class DbSecretVault {
  /** 復号した値（暗号化した値ごと。起動している間だけ。キーチェーンに何度も聞かない） */
  private readonly opened = new Map<string, Promise<string>>();
  /** キーチェーンで開けなかったときに利用者が入れたパスワード（接続ごと。Kickoff を終えるまでメモリにだけ持つ） */
  private readonly entered = new Map<number, PasswordFields>();

  constructor(
    private readonly store: Store,
    private readonly cipher: SecretCipher | null,
  ) {}

  /** 暗号化するか（口がなければ暗号化せずに置く） */
  get encrypting() {
    return this.cipher !== null;
  }

  /** 保存する前に、本文のパスワードを暗号化した値に置き換える（ほかの項目はそのまま） */
  async seal<T extends PasswordFields>(body: T): Promise<T> {
    const out: T = { ...body };
    for (const kind of DB_SECRET_KINDS) {
      const value = body[kind];
      if (value) out[kind] = await this.sealOne(value);
    }
    return out;
  }

  private async sealOne(plain: string) {
    if (!this.cipher) return plain;
    try {
      return SEALED + (await this.cipher.encrypt(plain));
    } catch (error) {
      throw new Invalid(`パスワードを暗号化できませんでした（${errorMessage(error)}）`);
    }
  }

  /**
   * 接続のパスワード（なければ null）。利用者がその場で入れた値があればそれ、なければ保存した値を復号する。
   * キーチェーンで開けなければ DbPasswordLocked
   */
  async read(connection: { id: number; name: string }, kind: DbSecretKind): Promise<string | null> {
    const entered = this.entered.get(connection.id)?.[kind];
    if (entered !== undefined) return entered;
    const stored = this.store.secrets.get(KEY_OF[kind](connection.id));
    if (stored === null || !stored.startsWith(SEALED)) return stored;
    return this.open(stored).catch(() => {
      throw new DbPasswordLocked(connection.name);
    });
  }

  private open(stored: string): Promise<string> {
    const known = this.opened.get(stored);
    if (known) return known;
    const cipher = this.cipher;
    const opening = cipher ? cipher.decrypt(stored.slice(SEALED.length)) : Promise.reject(new Error("暗号化の口がありません"));
    // 開けなかったものは覚えない（次の頼みでもう一度キーチェーンに聞く）
    opening.catch(() => this.opened.delete(stored));
    this.opened.set(stored, opening);
    return opening;
  }

  /** キーチェーンで開けなかったときに利用者が入れたパスワードを覚える（保存した値は消さない） */
  enter(connectionId: number, fields: PasswordFields) {
    this.entered.set(connectionId, { ...this.entered.get(connectionId), ...fields });
  }

  /** 入れたパスワードを忘れる（接続を消した・保存し直したとき） */
  forget(connectionId: number) {
    this.entered.delete(connectionId);
  }

  /**
   * 暗号化せずに置いていた DB のパスワードを、まとめて一度だけ暗号化して置き換える（暗号化を入れた版の最初の起動。
   * 元の値はファイルに残さない）。置き換えた数を返す。口がなければ何もしない
   */
  async migrate(): Promise<number> {
    if (!this.cipher) return 0;
    const plain = this.store.secrets.list("db_connection:").filter((e) => e.value && !e.value.startsWith(SEALED));
    if (plain.length === 0) return 0;
    const sealed = [];
    for (const e of plain) sealed.push({ key: e.key, value: await this.sealOne(e.value) });
    // 暗号化している間に利用者が変えた・消したものは置き換えない
    const still = sealed.filter((e, i) => this.store.secrets.get(e.key) === plain[i].value);
    this.store.secrets.replaceSecurely(still);
    return still.length;
  }
}

/** 起動のときの置き換え（失敗しても起動は止めない。次の起動でもう一度試す） */
export function migrateInBackground(vault: DbSecretVault) {
  vault
    .migrate()
    .then((count) => count > 0 && console.log(`[core] 暗号化せずに置いていた DB のパスワード ${count} 件を暗号化しました`))
    .catch((error) => console.warn(`[core] DB のパスワードを暗号化できませんでした（次の起動でもう一度試します）: ${errorMessage(error)}`));
}

// DB のパスワード（DB・AI 用のユーザー・SSH）の置き方: いつもキーチェーンの鍵（Electron の safeStorage）で暗号化して secrets に置く。
// AI がパスワードを知ると psql などで直接 DB に入れ、AI のツールの守りが素通りになるため。
// 暗号化の口はメインプロセスが startCore に渡す（コアは Electron に依らない）。口のない単体のコア・テストは暗号化せずに置く（予備）
import { DB_PASSWORD_LOCKED } from "@shared/database/types";
import { dbAiPasswordKey, dbPasswordKey, dbSshPasswordKey, type DbSecretKey } from "@/features/database/core/db/dbConnections";
import { Conflict } from "@/foundation/core/errors";
import { openSecret, SEALED, sealSecret, type SecretCipher } from "@/foundation/core/system/sealedSecret";

export type { SecretCipher } from "@/foundation/core/system/sealedSecret";

const DB_SECRET_KINDS = ["password", "ai_password", "ssh_password"] as const;
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
    private readonly store: { secrets: { get(key: DbSecretKey): string | null } },
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

  private sealOne(plain: string) {
    return sealSecret(this.cipher, plain, "パスワード");
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
    const opening = openSecret(this.cipher, stored);
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
}

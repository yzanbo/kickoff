import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { errorMessage } from "@shared/errors";
import { TRASH_KEEP_MS, TRASH_RESTORE_EXISTS, type TrashKind, type TrashRestoreResult } from "@shared/types";
import type { Store } from "../db/store.js";
import type { NewTrashItem, StoredTrashItem } from "../db/trash.js";
import { Conflict, NotFound } from "../http/errors.js";
import { isTrashId, restoreName } from "./names.js";

/** 片付け（期限の来たものを本当に消す・AI が kickoff-trash で入れたものを覚える）を流す間隔 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** AI の kickoff-trash が途中で止まった（中身のない）置き場のフォルダを消すまで */
const STALE_INBOX_MS = 60 * 60 * 1000;
/** 大きさを数えるときに見るファイルの数の上限（node_modules などで時間をかけすぎない） */
const MEASURE_MAX_ENTRIES = 500_000;

/** 置き場のフォルダの中で、中身を置くフォルダの名前 */
export const TRASH_ITEM_DIR = "item";

/**
 * 種類ごとの扱い（チャット・プロジェクトなど、置き場にファイルを置かないもの・戻すときに一緒に戻すものがある種類）。
 * 行を消す・置き場のフォルダを消すのはサービスがする
 */
export interface TrashKindHandler {
  /** 元に戻す（ファイルの種類は、ファイルを戻したあとに呼ぶ。restoredPath は戻した場所 = 同じ名前があって別の名前で戻したなら元の場所と違う） */
  restore?(item: StoredTrashItem, restoredPath: string | null): void | Promise<void>;
  /** 本当に消す */
  purge?(item: StoredTrashItem): void | Promise<void>;
}

export interface TrashServiceDeps {
  store: Store;
  /** 置き場（データのフォルダの trash/） */
  dir: string;
  /** AI の kickoff-trash で入れたもののうち、消したチャットが分からないものを、どのプロジェクトのゴミ箱に出すか（元の場所から。分からなければ null） */
  projectOfPath?: (origin: string) => number | null;
  /** AI の kickoff-trash で入れたものを取り込んだあと（メモならメモのチャットも一緒に入れる） */
  onImported?: (item: StoredTrashItem) => void;
  /** いまの時刻（テストで差し替える） */
  now?: () => number;
}

/** 移す（同じディスクなら名前の変更、別のディスクなら写してから消す） */
async function move(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    await fs.cp(from, to, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true, errorOnExist: true, force: false });
    await fs.rm(from, { recursive: true, force: true });
  }
}

const exists = (p: string) => fs.lstat(p).then(
  () => true,
  () => false,
);

/** フォルダの中身を足した大きさ（リンクはたどらない。数えすぎたら null） */
async function measure(target: string): Promise<number | null> {
  let total = 0;
  let seen = 0;
  const stack = [target];
  while (stack.length > 0) {
    const p = stack.pop()!;
    const st = await fs.lstat(p).catch(() => null);
    if (!st) continue;
    if (++seen > MEASURE_MAX_ENTRIES) return null;
    total += st.size;
    if (st.isDirectory()) for (const name of await fs.readdir(p).catch(() => [] as string[])) stack.push(path.join(p, name));
  }
  return total;
}

const readText = (p: string) => fs.readFile(p, "utf8").then(
  (s) => s.trim(),
  () => null,
);

/**
 * Kickoff のゴミ箱（メモの仕様書「ファイル削除」）。消したものを置き場（データのフォルダの trash/<id>/item/<名前>）に移して 3 日取っておき、
 * 元の場所に戻せる。期限の来たものは、起動したときと 1 時間ごとの片付けで本当に消す（閉じていた間の分は次の起動で）。
 * AI の kickoff-trash は自分で置き場にフォルダ（<id>/origin・chat・at と item/）を作るので、片付け・一覧を読むときに覚え書き（表）へ取り込む
 * （出すのは消したチャットのプロジェクトのゴミ箱。チャットが分からなければ元の場所を含むプロジェクト）
 */
export class TrashService {
  private readonly handlers = new Map<TrashKind, TrashKindHandler>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private sweeping: Promise<void> | null = null;

  constructor(private readonly deps: TrashServiceDeps) {}

  get dir(): string {
    return this.deps.dir;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** 種類ごとの扱いを登録する（チャット・プロジェクトなど） */
  register(kind: TrashKind, handler: TrashKindHandler): void {
    this.handlers.set(kind, handler);
  }

  /** ファイル・フォルダを置き場へ移して覚える（なければ 404） */
  async putPath(
    target: string,
    opts: { projectId: number | null; byChatId?: number | null; details?: Record<string, unknown>; label?: string },
  ): Promise<StoredTrashItem> {
    const abs = path.resolve(target);
    const st = await fs.lstat(abs).catch(() => null);
    if (!st) throw new NotFound(`見つかりません: ${abs}`);
    const id = randomUUID();
    const holder = path.join(this.deps.dir, id, TRASH_ITEM_DIR);
    await fs.mkdir(holder, { recursive: true });
    try {
      await move(abs, path.join(holder, path.basename(abs)));
    } catch (e) {
      await fs.rm(path.join(this.deps.dir, id), { recursive: true, force: true });
      throw e;
    }
    const item = this.deps.store.trash.add({
      id,
      project_id: opts.projectId,
      kind: "file",
      label: opts.label ?? path.basename(abs),
      origin: abs,
      is_dir: st.isDirectory(),
      by_chat_id: opts.byChatId ?? null,
      details: opts.details,
    });
    this.measureLater(item.id);
    return item;
  }

  /** 置き場にファイルを置かないもの（チャット・プロジェクト）を覚える */
  addRecord(item: Omit<NewTrashItem, "id">): StoredTrashItem {
    return this.deps.store.trash.add({ ...item, id: randomUUID() });
  }

  /** 中身の大きさを待たずに数えて書く */
  private measureLater(id: string): void {
    void measure(path.join(this.deps.dir, id, TRASH_ITEM_DIR)).then((size) => {
      if (size !== null) this.deps.store.trash.setSize(id, size);
    });
  }

  /** 置き場の中身（item/ の中のただ 1 つのもの。なければ null） */
  private async storedPath(id: string): Promise<string | null> {
    const holder = path.join(this.deps.dir, id, TRASH_ITEM_DIR);
    const names = await fs.readdir(holder).catch(() => [] as string[]);
    return names.length === 1 ? path.join(holder, names[0]) : null;
  }

  /**
   * AI の kickoff-trash が置いたものを覚え書きに取り込む（覚え書きのない置き場のフォルダのうち origin のあるもの）。
   * 中身のないまま古くなったもの（途中で止まった）は消す。取り込んだ数を返す
   */
  async importInbox(): Promise<number> {
    const names = await fs.readdir(this.deps.dir).catch(() => [] as string[]);
    let imported = 0;
    for (const id of names) {
      if (!isTrashId(id) || this.deps.store.trash.get(id)) continue;
      const folder = path.join(this.deps.dir, id);
      const origin = await readText(path.join(folder, "origin"));
      const stored = await this.storedPath(id);
      if (!origin || !stored) {
        const st = await fs.stat(folder).catch(() => null);
        if (st && this.now() - st.mtimeMs > STALE_INBOX_MS) await fs.rm(folder, { recursive: true, force: true });
        continue;
      }
      const chatText = await readText(path.join(folder, "chat"));
      const chatId = chatText && /^\d+$/.test(chatText) ? Number(chatText) : null;
      const chat = chatId !== null ? this.deps.store.chats.get(chatId) : null;
      const byChatId = chat ? chat.id : null;
      const at = await readText(path.join(folder, "at"));
      const st = await fs.lstat(stored).catch(() => null);
      const trashedAt = at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : new Date(this.now()).toISOString();
      const added = this.deps.store.trash.add({
        id,
        project_id: chat ? chat.project_id : (this.deps.projectOfPath?.(origin) ?? null),
        kind: "file",
        label: path.basename(origin),
        origin,
        is_dir: st?.isDirectory() ?? false,
        by_chat_id: byChatId,
        trashed_at: trashedAt,
      });
      this.measureLater(id);
      this.deps.onImported?.(added);
      imported++;
    }
    return imported;
  }

  /** プロジェクトのゴミ箱（AI が入れたばかりのものも取り込んでから） */
  async list(projectId: number): Promise<StoredTrashItem[]> {
    await this.importInbox().catch(() => 0);
    return this.deps.store.trash.list(projectId);
  }

  /**
   * 元に戻す。ファイルは元の場所へ（元の場所に同じ名前があれば、rename でなければ 409 と TRASH_RESTORE_EXISTS。rename なら「名前 2」などで戻す。
   * 途中のフォルダがなければ作る）。チャット・プロジェクトは種類ごとの扱いで戻す
   */
  async restore(id: string, opts: { rename?: boolean } = {}): Promise<TrashRestoreResult> {
    // AI が kickoff-trash で入れたばかりで、まだ取り込んでいないもの（会話の中の「戻す」）も戻せるように
    if (!this.deps.store.trash.get(id)) await this.importInbox().catch(() => 0);
    const item = this.deps.store.trash.get(id);
    if (!item) throw new NotFound("ゴミ箱にありません（もう消えたか、戻したあとです）");
    const handler = this.handlers.get(item.kind);
    if (item.origin === null) {
      await handler?.restore?.(item, null);
      this.deps.store.trash.remove(id);
      return { path: null };
    }
    const stored = await this.storedPath(id);
    if (!stored) throw new NotFound("ゴミ箱の中身が見つかりません");
    let target = item.origin;
    if (await exists(target)) {
      if (!opts.rename) throw new Conflict(`元の場所に同じ名前があります: ${target}`, TRASH_RESTORE_EXISTS);
      const dir = path.dirname(target);
      const taken = new Set(await fs.readdir(dir).catch(() => [] as string[]));
      target = path.join(dir, restoreName(path.basename(target), (name) => taken.has(name)));
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await move(stored, target);
    await fs.rm(path.join(this.deps.dir, id), { recursive: true, force: true });
    this.deps.store.trash.remove(id);
    await handler?.restore?.(item, target);
    return { path: target };
  }

  /** 本当に消す（種類ごとの扱い → 置き場のフォルダ → 覚え書き） */
  async purge(item: StoredTrashItem): Promise<void> {
    await this.handlers.get(item.kind)?.purge?.(item);
    await fs.rm(path.join(this.deps.dir, item.id), { recursive: true, force: true });
    this.deps.store.trash.remove(item.id);
  }

  /** 片付け（AI が入れたものを取り込み、3 日たったものを本当に消す）。重ねて呼ばれたら 1 つにまとめる */
  sweep(): Promise<void> {
    this.sweeping ??= (async () => {
      try {
        await this.importInbox();
        const before = new Date(this.now() - TRASH_KEEP_MS).toISOString();
        for (const item of this.deps.store.trash.expiredBefore(before)) {
          await this.purge(item).catch((e: unknown) => console.warn(`[trash] ${item.label} を消せませんでした: ${errorMessage(e)}`));
        }
      } finally {
        this.sweeping = null;
      }
    })();
    return this.sweeping;
  }

  /** 起動したときと 1 時間ごとに片付ける */
  start(): void {
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

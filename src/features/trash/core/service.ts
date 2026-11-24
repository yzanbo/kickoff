import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { errorMessage } from "@shared/foundation/errors";
import { TRASH_KEEP_MS, TRASH_RESTORE_EXISTS, type FileTrashDetails, type TrashKind, type TrashRestoreResult } from "@shared/trash/types";
import type { NewTrashItem, StoredTrashItem, TrashChats, TrashStore } from "@/features/trash/core/db/trash";
import { systemClock, type Clock } from "@/foundation/core/clock";
import { Conflict, NotFound } from "@/foundation/core/errors";
import { createPoller, type Poller } from "@/foundation/core/watch/poller";
import { restoreName } from "./names";
import type { TrashKindDef, TrashKindHandler } from "./kinds";
import { exists, measure, move } from "./trashFiles";
import { readInbox, storedPathOf, TRASH_ITEM_DIR } from "./inbox";

/** 片付け（期限の来たものを本当に消す・AI が kickoff-trash で入れたものを覚える）を流す間隔 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** 一緒に入れたもの（会話記録と同じ名前のフォルダ = サブエージェントの記録など）を置くフォルダの名前。戻すときは元の場所へ戻す（覚え書きの details.companions） */
const TRASH_COMPANION_DIR = "with";

export interface TrashServiceDeps {
  items: TrashStore;
  /** 置き場（データのフォルダの trash/） */
  dir: string;
  /** いまの時刻（テストで差し替える） */
  now?: () => number;
  /** 片付けの間隔を数える時計（省けば本物の時計） */
  clock?: Clock;
}

/**
 * Kickoff のゴミ箱。消したものを置き場（データのフォルダの trash/<id>/item/<名前>）に移して 3 日取っておき、
 * 元の場所に戻せる。期限の来たものは、起動したときと 1 時間ごとの片付けで本当に消す（閉じていた間の分は次の起動で。利用者は待たずに完全に消すこともできる `purgeNow`）。容量の上限は持たない（3 日で必ず消えるため）。
 * AI の kickoff-trash は自分で置き場にフォルダ（<id>/origin・chat・at と item/）を作るので、片付け・一覧を読むときに覚え書き（表）へ取り込む
 * （出すのは消したチャットのプロジェクトのゴミ箱。チャットが分からなければ元の場所を含むプロジェクト）
 */
export class TrashService {
  private readonly handlers = new Map<TrashKind, TrashKindHandler>();
  /** 起動したときと 1 時間ごとの片付け */
  private readonly poller: Poller;
  private sweeping: Promise<void> | null = null;
  /** 動いている片付けのあとに、もう一度流す片付け（待っている頼みは 1 つにまとめる） */
  private sweepAgain: Promise<void> | null = null;
  /** いま本当に消している途中のもの */
  private readonly purging = new Set<string>();

  constructor(private readonly deps: TrashServiceDeps) {
    this.poller = createPoller({ intervalMs: SWEEP_INTERVAL_MS, runAtStart: true, run: () => this.sweep(), clock: deps.clock ?? systemClock });
  }

  /** 覚え書きの店（chat がチャットの行の中身を書く）と置き場 */
  get items(): TrashStore { return this.deps.items; }
  get dir(): string { return this.deps.dir; }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** 片付けのたびに一緒に流すもの（Kickoff が作ったセッションのうち、使われなくなったものの会話記録をゴミ箱へ入れるなど） */
  private readonly sweepSteps: (() => Promise<unknown>)[] = [];
  /** 元の場所からプロジェクトを引く口（本体・ノートのフォルダ。足した順に聞き、最初の答え）と、AI の kickoff-trash で入れたものを取り込んだあとに呼ぶもの（ノートのチャットも一緒に入れる）。上の機能が登録する */
  private readonly originResolvers: ((origin: string) => number | null)[] = [];
  private readonly importHooks: ((item: StoredTrashItem) => void)[] = [];

  /** 元の場所を含むプロジェクト（AI の kickoff-trash で入れたもののうち、消したチャットが分からないものを出すゴミ箱。なければ null） */
  projectOf(origin: string): number | null {
    return this.originResolvers.reduce<number | null>((found, resolve) => found ?? resolve(origin), null);
  }

  /** 元の場所からプロジェクトを引く口・取り込んだあとに呼ぶもの・片付け（起動したとき・1 時間ごと）に一緒に流すもの（失敗しても片付けは止めない）を足す */
  addOriginResolver(resolve: (origin: string) => number | null): void {
    this.originResolvers.push(resolve);
  }
  addImportHook(hook: (item: StoredTrashItem) => void): void {
    this.importHooks.push(hook);
  }
  addSweepStep(step: () => Promise<unknown>): void {
    this.sweepSteps.push(step);
  }

  /** 種類ごとの扱いを登録する（チャット・プロジェクトなど。trash は種類の中身を知らない） */
  registerKind({ kind, ...handler }: TrashKindDef): void {
    this.handlers.set(kind, handler);
  }

  /** 読むチャットの口（chat が useChats で登録する。登録するまでは、AI の kickoff-trash で入れたもののチャットは分からない扱い） */
  private chats: TrashChats | null = null;
  useChats(chats: TrashChats): void {
    this.chats = chats;
    this.deps.items.useChatTitles(chats.titlesOf);
  }

  /** ファイル・フォルダを置き場へ移して覚える（なければ 404） */
  async putPath(
    target: string,
    opts: { projectId: number | null; byChatId?: number | null; details?: FileTrashDetails; label?: string; kind?: "file" | "session"; companions?: string[] },
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
    // 一緒に入れるもの（あるものだけ。入れられなくても本体は入れたまま）
    const companions: string[] = [];
    for (const extra of opts.companions ?? []) {
      const abs2 = path.resolve(extra);
      if (!(await exists(abs2))) continue;
      const dir = path.join(this.deps.dir, id, TRASH_COMPANION_DIR, String(companions.length));
      await fs.mkdir(dir, { recursive: true });
      if (await move(abs2, path.join(dir, path.basename(abs2))).then(() => true, () => false)) companions.push(abs2);
    }
    const item = this.deps.items.add({
      id,
      project_id: opts.projectId,
      kind: opts.kind ?? "file",
      label: opts.label ?? path.basename(abs),
      origin: abs,
      is_dir: st.isDirectory(),
      by_chat_id: opts.byChatId ?? null,
      details: companions.length > 0 ? { ...opts.details, companions } : opts.details,
      trashed_at: this.stamp(),
    });
    this.measureLater(item.id);
    return item;
  }

  /** 置き場にファイルを置かないもの（チャット・プロジェクト）を覚える */
  addRecord(item: Omit<NewTrashItem, "id" | "trashed_at"> & { trashed_at?: string }): StoredTrashItem {
    return this.deps.items.add({ ...item, id: randomUUID(), trashed_at: item.trashed_at ?? this.stamp() });
  }

  /**
   * 入れた時刻（片付けが 3 日たったかを数えるのと同じ時計 now で付ける。DB の時計で付けると、時計を差し替えたテストで、
   * 準備から入れるまでにかかった分だけ境目がずれて消えなかった）
   */
  private stamp(): string {
    return new Date(this.now()).toISOString();
  }

  /** 中身の大きさを待たずに数えて書く */
  private measureLater(id: string): void {
    void Promise.all([measure(path.join(this.deps.dir, id, TRASH_ITEM_DIR)), measure(path.join(this.deps.dir, id, TRASH_COMPANION_DIR))]).then(([size, extra]) => {
      if (size !== null) this.deps.items.setSize(id, size + (extra ?? 0));
    });
  }

  /**
   * AI の kickoff-trash が置いたものを覚え書きに取り込む（覚え書きのない置き場のフォルダのうち origin のあるもの）。
   * 中身のないまま古くなったもの（途中で止まった）は消す。取り込んだ数を返す
   */
  async importInbox(): Promise<number> {
    const found = await readInbox(this.deps.dir, (id) => Boolean(this.deps.items.get(id)), () => this.now());
    for (const entry of found) {
      const chatProject = entry.chatId !== null ? (this.chats?.projectOf(entry.chatId) ?? null) : null;
      const added = this.deps.items.add({
        id: entry.id,
        project_id: chatProject ?? this.projectOf(entry.origin),
        kind: "file",
        label: path.basename(entry.origin),
        origin: entry.origin,
        is_dir: entry.isDir,
        by_chat_id: chatProject !== null ? entry.chatId : null,
        trashed_at: entry.trashedAt,
      });
      this.measureLater(entry.id);
      for (const hook of this.importHooks) hook(added);
    }
    return found.length;
  }

  /** プロジェクトのゴミ箱（AI が入れたばかりのものも取り込んでから） */
  async list(projectId: number): Promise<StoredTrashItem[]> {
    await this.importInbox().catch(() => 0);
    return this.deps.items.list(projectId);
  }

  /**
   * 元に戻す。ファイルは元の場所へ（元の場所に同じ名前があれば、rename でなければ 409 と TRASH_RESTORE_EXISTS。rename なら「名前 2」などで戻す。
   * 途中のフォルダがなければ作る）。チャット・プロジェクトは種類ごとの扱いで戻す
   */
  async restore(id: string, opts: { rename?: boolean } = {}): Promise<TrashRestoreResult> {
    // AI が kickoff-trash で入れたばかりで、まだ取り込んでいないもの（会話の中の「戻す」）も戻せるように
    if (!this.deps.items.get(id)) await this.importInbox().catch(() => 0);
    const item = this.deps.items.get(id);
    if (!item) throw new NotFound("ゴミ箱にありません（もう消えたか、戻したあとです）");
    const handler = this.handlers.get(item.kind);
    if (item.origin === null) {
      await handler?.restore?.(item, null);
      this.deps.items.remove(id);
      return { path: null };
    }
    const stored = await storedPathOf(this.deps.dir, id);
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
    await this.restoreCompanions(item);
    await fs.rm(path.join(this.deps.dir, id), { recursive: true, force: true });
    this.deps.items.remove(id);
    await handler?.restore?.(item, target);
    return { path: target };
  }

  /** 一緒に入れたものを元の場所へ戻す（元の場所にもう何かあれば戻さない = 消える） */
  private async restoreCompanions(item: StoredTrashItem): Promise<void> {
    const companions = "companions" in item.details ? (item.details.companions ?? []) : [];
    for (const [i, origin] of companions.entries()) {
      const from = path.join(this.deps.dir, item.id, TRASH_COMPANION_DIR, String(i), path.basename(origin));
      if (!(await exists(from)) || (await exists(origin))) continue;
      await fs.mkdir(path.dirname(origin), { recursive: true });
      await move(from, origin).catch(() => {});
    }
  }

  /**
   * 本当に消す（種類ごとの扱い → 置き場のフォルダ → 覚え書き）。同じものをいま消している途中なら何もしない
   * （片付けと、利用者の「完全に消す」が重なったとき、種類ごとの扱いを 2 回流さないため）
   */
  async purge(item: StoredTrashItem): Promise<void> {
    if (this.purging.has(item.id)) return;
    this.purging.add(item.id);
    try {
      await this.handlers.get(item.kind)?.purge?.(item);
      await fs.rm(path.join(this.deps.dir, item.id), { recursive: true, force: true });
      this.deps.items.remove(item.id);
    } finally {
      this.purging.delete(item.id);
    }
  }

  /**
   * 3 日を待たずに、利用者が選んだものを完全に消す（ゴミ箱の行の「完全に消す」・「ゴミ箱を空にする」）。もうないもの（戻した・消えた）は飛ばし、
   * 消した数を返す。1 つ消せなくても残りは消し、最後に最初の失敗を投げる
   */
  async purgeNow(ids: string[]): Promise<number> {
    let purged = 0;
    let failure: unknown = null;
    for (const id of new Set(ids)) {
      const item = this.deps.items.get(id);
      if (!item) continue;
      try {
        await this.purge(item);
        if (!this.deps.items.get(id)) purged++;
      } catch (e) {
        failure ??= e;
      }
    }
    if (failure) throw failure;
    return purged;
  }

  /**
   * 片付け（AI が入れたものを取り込み、3 日たったものを本当に消す）。動いている片付けがあれば、それが終わってからもう一度流す
   * （動いている片付けは頼まれる前の時計と中身で数えているので、その結果で済ませると、頼んだときに 3 日たっていたものが残る。起動のときの片付けが長引くと起きた）。
   * 待っている頼みは 1 つにまとめる
   */
  sweep(): Promise<void> {
    if (this.sweeping) {
      this.sweepAgain ??= this.sweeping.then(() => {
        this.sweepAgain = null;
        return this.sweep();
      });
      return this.sweepAgain;
    }
    this.sweeping = (async () => {
      try {
        await this.importInbox();
        for (const step of this.sweepSteps) await step().catch((e: unknown) => console.warn(`[trash] 片付けの途中で失敗しました: ${errorMessage(e)}`));
        const before = new Date(this.now() - TRASH_KEEP_MS).toISOString();
        for (const item of this.deps.items.expiredBefore(before)) {
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
    this.poller.start();
  }

  close(): void {
    this.poller.stop();
  }
}

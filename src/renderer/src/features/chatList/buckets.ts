/**
 * チャットをまとまりに分ける仕組み（サイドバーのまとまり・ボードの段と列・パネルのタブのまとまり・状態ごとの一覧・⌘⇧A で共通の 1 つ）。
 *
 * まとまりのキーは 1 つの形にそろえる: プロジェクトを根にした道のり。
 *   プロジェクト "p3" / グループ "p3/g5" / グループなし "p3/ungrouped" / 作業場所 "p3/w:main"・"p3/w:<フォルダ>"・"p3/w:branch:<ブランチ>" /
 *   固定 "p3/pinned" / アーカイブ済み "p3/archived" / 状態 "status:running"（プロジェクトの中なら "p3/status:running"）。
 * 中の段は親のキーに "/" でつなぐ（"p3/g5/status:read"・"p3/archived/w:main/status:read"）。
 * 開閉の記憶・React の key・タブのまとまりのキーに、そのまま使う（どこで分けても、同じまとまりは同じキー）。
 *
 * 決まり（どこで分けても同じ）:
 * - もうないグループ（消した・まだ読み込んでいない）のチャット・下書きは「グループなし」に入れる
 * - プロジェクトで分けるときに並び projects を渡したら、そこにあるプロジェクトの段だけを作る（全プロジェクトのボード: しまったものは出さない）
 * - 下書きの行き先: グループ = 作成先のグループ / プロジェクト = そのプロジェクト / 作業場所 = そのプロジェクトの本体
 *   （新しいチャットは本体で始まり、作業場所は送るときに選ぶため）/ 状態 = 入れない（下書きは別に並べる）
 * - 並び: プロジェクトの順（渡した並び → ほかは出てきた順）、その中は 固定 → グループ（サイドバーと同じ並び）・作業場所（本体 → ワークツリー
 *   （名前順）→ フォルダなし → 以前のブランチ）・状態（作業中 → 回答待ち → 未読 → 既読）→ グループなし、いちばん後ろにアーカイブ済み → その他。
 *   まとまりの中のチャットは最後に動いた順
 */
import { boardColumnOf } from "@shared/chat/state";
import { BOARD_COLUMN_LABELS, BOARD_COLUMNS, type BoardColumn, type Chat, type ChatGroup, type GitWorktree, type Project } from "@shared/types";
import { chatStateOf, stateCounts, type ApprovalIndex, type StateCounts } from "@/features/chat/chatState";
import { compareWorkplaces, workplaceOf, type ChatWorkplace } from "@/features/worktree/workplace";
import { byActive } from "@/stores/chats";

/** まとまりの分け方（1 段） */
export type BucketBy = "project" | "group" | "worktree" | "status";

/**
 * まとまりの種類。group = 自分で作ったグループ / ungrouped = グループなし / worktree = 作業場所（ブランチ）/ status = 状態（カンバンの列）/
 * project = プロジェクト / pinned = 固定（抜き出したもの）/ archived = アーカイブ済み（抜き出したもの）/ all = まとめないときの見出しのないまとまり /
 * other = どのまとまりにも入らないもの（パネルのブラウザのタブなど。bucketChats は作らない）
 */
export type BucketKind = "project" | "group" | "ungrouped" | "worktree" | "status" | "pinned" | "archived" | "all" | "other";

/** 下書き（送る前の新しいチャット）の作成先 */
export interface DraftTarget {
  projectId: number;
  group?: number;
}

/** まとまりの見出し（どのまとまりか。中身はまだ入れない） */
export interface BucketHead {
  /** まとまりのキー（ファイルの先頭の形） */
  key: string;
  kind: BucketKind;
  /** 見出しの名前（all は空） */
  label: string;
  /** マウスを乗せたときの説明 */
  title?: string;
  /** まとまりのプロジェクト（プロジェクトにまたがる状態のまとまりなどにはない） */
  projectId?: number;
  /** project のときのプロジェクト（並びに渡したものから引く） */
  project?: Project;
  /** group のときのグループ */
  group?: ChatGroup;
  /** worktree のときの作業場所 */
  place?: ChatWorkplace;
  /** status のときの列 */
  column?: BoardColumn;
}

/** チャットを入れたまとまり */
export interface ChatBucket<D extends DraftTarget = DraftTarget> extends BucketHead {
  /** まとまりのチャット（最後に動いた順） */
  chats: Chat[];
  /** まとまりに入る下書き（いちばん外の段だけ。渡した順） */
  drafts: D[];
  /** 状態ごとのチャット数（stateCounts。アーカイブ済みは数えない） */
  counts: StateCounts;
  /** 中の段のまとまり（2 段以上で分けたとき） */
  children?: ChatBucket<D>[];
}

/** 分けるのに使う、いまの状態（画面では useChatBuckets が店から渡す） */
export interface BucketContext {
  /** 回答待ちの依頼があるチャット（状態の列と数を決める） */
  pending: ApprovalIndex;
  /** そのプロジェクトのグループ（サイドバーと同じ並び）。グループで分けるとき */
  groupsOf?: (projectId: number) => readonly ChatGroup[];
  /** そのプロジェクトのワークツリーの一覧（読み込み中は undefined）。作業場所で分けるとき */
  worktreesOf?: (projectId: number) => GitWorktree[] | undefined;
  /** プロジェクトの並び（と名前）。まとまりをこの順に並べ、プロジェクトで分けるときは段の名前に使う */
  projects?: readonly Project[];
}

export interface BucketOptions<D extends DraftTarget = DraftTarget> extends BucketContext {
  /** 分け方（外の段から順に。空ならまとめない = 見出しのないまとまり all 1 つ） */
  by: BucketBy | readonly BucketBy[];
  /** 1 つのプロジェクトの中だけを分ける（サイドバー・プロジェクトのボード）: ほかのプロジェクトのものは入れず、キーをそのプロジェクトの下に置く */
  project?: number;
  /** 状態で分けるときの列（既定はカンバンの 4 列。ここにない列のチャットは入れない） */
  columns?: readonly BoardColumn[];
  /** 固定したチャットを、プロジェクトごとの「固定」に抜き出す（いちばん前。中は分けない） */
  pinned?: boolean;
  /**
   * アーカイブ済みのチャット: keep = ほかと同じく分ける（既定）/ bucket = 「アーカイブ済み」に抜き出す（いちばん後ろ。中はグループを除いた段で分ける）/
   * drop = 入れない
   */
  archived?: "keep" | "bucket" | "drop";
  /** 下書き。作成先のまとまりに入れる（いちばん外の段だけ） */
  drafts?: readonly D[];
  /** チャットも下書きもないまとまりも出すか（グループ = そのプロジェクトのグループすべてとグループなし、状態 = すべての列、プロジェクト = projects のすべて） */
  keepEmpty?: boolean | ((head: BucketHead) => boolean);
}

/** プロジェクトのまとまりのキー（ほかのまとまりのキーの根） */
export const projectKey = (projectId: number) => `p${projectId}`;

/** まとまりのキー: 親があれば親につなぎ、なければ scope のプロジェクトの下（scope もなければそのまま） */
const keyAt = (local: string, scope: number | undefined, parent: string | undefined) =>
  parent !== undefined ? `${parent}/${local}` : scope === undefined ? local : `${projectKey(scope)}/${local}`;

/** グループ（null はグループなし）・固定・アーカイブ済みのまとまりのキー（まとまりがまだないとき（開閉をそろえる）にも使う） */
export const groupKey = (projectId: number, groupId: number | null) => keyAt(groupId === null ? "ungrouped" : `g${groupId}`, projectId, undefined);
export const pinnedKey = (projectId: number) => keyAt("pinned", projectId, undefined);
export const archivedKey = (projectId: number) => keyAt("archived", projectId, undefined);

const ZERO_COUNTS: StateCounts = Object.freeze({ running: 0, needs_input: 0, unread: 0 });

/** 本体（新しいチャット・下書きの作業場所） */
const MAIN_PLACE = { worktree_path: null, branch: null };

/** プロジェクトのまとまり（並び projects を渡したときは、そこにないプロジェクトの段は作らない = undefined） */
function projectHead(projectId: number, ctx: BucketContext, parent?: string): BucketHead | undefined {
  const project = ctx.projects?.find((p) => p.id === projectId);
  if (ctx.projects && !project) return undefined;
  return { key: parent === undefined ? projectKey(projectId) : `${parent}/${projectKey(projectId)}`, kind: "project", label: project?.name ?? "", projectId, project };
}

/** グループのまとまり（グループがもうない・読み込み中・null ならグループなし） */
function groupHead(projectId: number, groupId: number | null | undefined, ctx: BucketContext, parent?: string): BucketHead {
  const group = groupId == null ? undefined : ctx.groupsOf?.(projectId).find((g) => g.id === groupId);
  if (!group) return { key: keyAt("ungrouped", projectId, parent), kind: "ungrouped", label: "グループなし", title: "グループに入っていないチャット", projectId };
  return { key: keyAt(`g${group.id}`, projectId, parent), kind: "group", label: group.name, title: `グループ: ${group.name}`, projectId, group };
}

/** 作業場所のまとまり（見出しはサイドバー・ボードと同じ workplaceOf） */
export function workplaceHead(projectId: number, chat: Pick<Chat, "worktree_path" | "branch">, ctx: BucketContext, parent?: string): BucketHead {
  const place = workplaceOf(chat, ctx.worktreesOf?.(projectId));
  return { key: keyAt(`w:${place.key || "main"}`, projectId, parent), kind: "worktree", label: place.name || "本体", title: place.title, projectId, place };
}

const statusHead = (column: BoardColumn, scope: number | undefined, parent: string | undefined): BucketHead => ({
  key: keyAt(`status:${column}`, scope, parent),
  kind: "status",
  label: BOARD_COLUMN_LABELS[column],
  projectId: scope,
  column,
});

const pinnedHead = (scope: number | undefined): BucketHead => ({ key: keyAt("pinned", scope, undefined), kind: "pinned", label: "固定", title: "固定したチャット", projectId: scope });

const archivedHead = (scope: number | undefined): BucketHead => ({
  key: keyAt("archived", scope, undefined),
  kind: "archived",
  label: "アーカイブ済み",
  title: "アーカイブ済みのチャット",
  projectId: scope,
});

/** その段で、チャットが入るまとまり（状態で分けるとき、columns にない列なら undefined） */
function levelHead(chat: Chat, by: BucketBy | undefined, ctx: BucketContext, columns: readonly BoardColumn[], scope: number | undefined, parent?: string): BucketHead | undefined {
  switch (by) {
    case undefined:
      return { key: keyAt("all", scope, parent), kind: "all", label: "", projectId: scope };
    case "project":
      return projectHead(chat.project_id, ctx, parent);
    case "group":
      return groupHead(chat.project_id, chat.group_id, ctx, parent);
    case "worktree":
      return workplaceHead(chat.project_id, chat, ctx, parent);
    case "status": {
      const column = boardColumnOf(chatStateOf(chat, ctx.pending));
      return columns.includes(column) ? statusHead(column, scope, parent) : undefined;
    }
  }
}

/**
 * チャットが入るまとまり（いちばん外の段。パネルのタブのまとまりにも使う）: アーカイブ済みを抜き出すならアーカイブ済み → 固定を抜き出すなら固定 →
 * 分け方のまとまり。固定・アーカイブ済みはプロジェクトごと（状態だけで分けるときは、プロジェクトにまたがって 1 つ）
 */
export function chatHead(
  chat: Chat,
  by: BucketBy | undefined,
  ctx: BucketContext,
  { pinned = false, archived = "keep", columns = BOARD_COLUMNS, project }: Pick<BucketOptions, "pinned" | "archived" | "columns" | "project"> = {},
): BucketHead | undefined {
  const scope = by === "status" || by === undefined ? project : chat.project_id;
  if (chat.archived_at) {
    if (archived === "drop") return undefined;
    if (archived === "bucket") return archivedHead(scope);
  } else if (pinned && chat.pinned) {
    return pinnedHead(scope);
  }
  return levelHead(chat, by, ctx, columns, project);
}

/** 下書きが入るまとまり（状態で分けるときは入れない = undefined） */
export function draftHead(target: DraftTarget, by: BucketBy | undefined, ctx: BucketContext, project?: number): BucketHead | undefined {
  switch (by) {
    case undefined:
      return { key: keyAt("all", project, undefined), kind: "all", label: "", projectId: project };
    case "project":
      return projectHead(target.projectId, ctx);
    case "group":
      return groupHead(target.projectId, target.group, ctx);
    case "worktree":
      return workplaceHead(target.projectId, MAIN_PLACE, ctx);
    case "status":
      return undefined;
  }
}

/** そのプロジェクトのグループのまとまり（サイドバーと同じ並び）とグループなし（チャットがなくても出すときの見出し） */
export function groupHeads(projectId: number, ctx: BucketContext): BucketHead[] {
  return [...(ctx.groupsOf?.(projectId) ?? []).map((g) => groupHead(projectId, g.id, ctx)), groupHead(projectId, null, ctx)];
}

/** チャットがなくても出せる見出し（keepEmpty で残すかを決める） */
function seedHeads(by: BucketBy | undefined, options: BucketOptions, columns: readonly BoardColumn[], top: boolean, scope: number | undefined, parent?: string): BucketHead[] {
  if (by === "status") return columns.map((c) => statusHead(c, scope, parent));
  if (!top) return [];
  if (by === "group") return (options.project !== undefined ? [options.project] : (options.projects ?? []).map((p) => p.id)).flatMap((id) => groupHeads(id, options));
  if (by === "project") return (options.projects ?? []).flatMap((p) => projectHead(p.id, options) ?? []);
  return [];
}

/** 後ろに置くまとまり（アーカイブ済み → その他）と、プロジェクトの中での並び */
const TAIL_RANK: Partial<Record<BucketKind, number>> = { archived: 1, other: 2 };
const KIND_RANK: Partial<Record<BucketKind, number>> = { pinned: 0, ungrouped: 2 };
const COLUMN_RANK = new Map<BoardColumn, number>(BOARD_COLUMNS.map((c, i) => [c, i]));

/** 同じ種類のまとまりどうしの並び（グループはサイドバーの並び、作業場所は本体が先、状態はカンバンの列の順） */
function compareWithin(a: BucketHead, b: BucketHead): number {
  if (a.group && b.group) return a.group.position - b.group.position || a.group.id - b.group.id;
  if (a.place && b.place) return compareWorkplaces(a.place, b.place);
  if (a.column && b.column) return (COLUMN_RANK.get(a.column) ?? 0) - (COLUMN_RANK.get(b.column) ?? 0);
  return 0;
}

/**
 * まとまりを並べる（ファイルの先頭の並び。並べ替えても同じ順のものは元の順のまま）。
 * projectOrder: プロジェクトの順（ここにないプロジェクトは、そのあとに list に出てきた順）
 */
export function sortBuckets<T extends BucketHead>(list: readonly T[], projectOrder: readonly number[] = []): T[] {
  const ranks = new Map<number, number>();
  for (const id of [...projectOrder, ...list.flatMap((b) => (b.projectId === undefined ? [] : [b.projectId]))]) if (!ranks.has(id)) ranks.set(id, ranks.size);
  const rankOf = (id: number | undefined) => (id === undefined ? -1 : (ranks.get(id) ?? ranks.size));
  return [...list].sort(
    (a, b) =>
      (TAIL_RANK[a.kind] ?? 0) - (TAIL_RANK[b.kind] ?? 0) ||
      rankOf(a.projectId) - rankOf(b.projectId) ||
      (KIND_RANK[a.kind] ?? 1) - (KIND_RANK[b.kind] ?? 1) ||
      compareWithin(a, b),
  );
}

const levelsOf = (by: BucketBy | readonly BucketBy[]): readonly BucketBy[] => (typeof by === "string" ? [by] : by);

/**
 * チャット（と下書き）をまとまりに分ける（純粋な関数。決まりはファイルの先頭）。
 * 例: サイドバーのグループ別 × 状態別 = bucketChats(chats, { by: ["group", "status"], project, pinned: true, archived: "bucket", ... })、
 * ボードの列 = bucketChats(chats, { by: "status", keepEmpty: true })、⌘⇧A = bucketChats(chats, { by: "status", columns: COUNTED_COLUMNS, archived: "drop" })
 */
export function bucketChats<D extends DraftTarget = DraftTarget>(chats: readonly Chat[], options: BucketOptions<D>): ChatBucket<D>[] {
  const own = (projectId: number) => options.project === undefined || projectId === options.project;
  const levels = levelsOf(options.by);
  return bucketLevel(
    chats.filter((c) => own(c.project_id)),
    (options.drafts ?? []).filter((d) => own(d.projectId)),
    levels,
    options,
    { top: true, scope: options.project },
  );
}

function bucketLevel<D extends DraftTarget>(
  chats: readonly Chat[],
  drafts: readonly D[],
  levels: readonly BucketBy[],
  options: BucketOptions<D>,
  at: { top: boolean; scope: number | undefined; parent?: string },
): ChatBucket<D>[] {
  const [by, ...inner] = levels;
  const columns = options.columns ?? BOARD_COLUMNS;
  const keepEmpty = options.keepEmpty ?? false;
  const keep = typeof keepEmpty === "function" ? keepEmpty : () => keepEmpty;
  const buckets = new Map<string, ChatBucket<D>>();
  const add = (head: BucketHead) => {
    let bucket = buckets.get(head.key);
    if (!bucket) buckets.set(head.key, (bucket = { ...head, chats: [], drafts: [], counts: ZERO_COUNTS }));
    return bucket;
  };
  for (const head of seedHeads(by, options, columns, at.top, at.scope, at.parent)) if (keep(head)) add(head);
  for (const chat of chats) {
    const head = at.top ? chatHead(chat, by, options, { ...options, columns, project: at.scope }) : levelHead(chat, by, options, columns, at.scope, at.parent);
    if (head) add(head).chats.push(chat);
  }
  for (const draft of drafts) {
    const head = draftHead(draft, by, options, at.scope);
    if (head) add(head).drafts.push(draft);
  }
  const list = sortBuckets([...buckets.values()], options.projects?.map((p) => p.id));
  for (const bucket of list) {
    bucket.chats.sort(byActive);
    bucket.counts = stateCounts(bucket.chats, options.pending);
    // 固定はまとめずに並べ、アーカイブ済みの中はグループを除いた段で分ける（グループに関係なく並べる）
    const next = bucket.kind === "pinned" ? [] : bucket.kind === "archived" ? levels.filter((l) => l !== "group") : inner;
    if (next.length > 0 && bucket.kind !== "all") {
      bucket.children = bucketLevel(bucket.chats, [], next, { ...options, pinned: false, archived: "keep" }, { top: false, scope: bucket.projectId, parent: bucket.key });
    }
  }
  return list;
}

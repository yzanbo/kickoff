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
 * - もうないグループ（消した・まだ読み込んでいない）のチャット・下書きは「No Group」に入れる
 * - プロジェクトで分けるときに並び projects を渡したら、そこにあるプロジェクトの段だけを作る（全プロジェクトのボード: しまったものは出さない）
 * - 下書きの行き先: グループ = 作成先のグループ / プロジェクト = そのプロジェクト / 作業場所 = そのプロジェクトの本体
 *   （新しいチャットは本体で始まり、作業場所は送るときに選ぶため）/ 状態 = 入れない（下書きは別に並べる）
 * - 並び: プロジェクトの順（渡した並び → ほかは出てきた順）、その中は 固定 → グループ（サイドバーと同じ並び）・作業場所（本体 → ワークツリー
 *   （名前順）→ フォルダなし → 以前のブランチ）・状態（作業中 → 回答待ち → 未読 → 既読）→ グループなし、いちばん後ろにアーカイブ済み → その他。
 *   まとまりの中のチャットは最後に動いた順
 * - アーカイブ済みを各まとまりの中に入れる（archived: "nested"）ときは、いちばん外の段のまとまりの archived に、そのまとまりのアーカイブ済み
 *   （キーは "p3/g5/archived"）を入れる。アーカイブ済みだけのまとまり（消えたワークツリーなど）も、そのために作る
 */
import { BOARD_COLUMNS, type BoardColumn, type Chat, type ChatGroup, type GitWorktree, type Project } from "@shared/types";
import { stateCounts, type ApprovalIndex, type StateCounts } from "@/features/chat/chatState";
import { compareWorkplaces, type ChatWorkplace } from "@/features/worktree/workplace";
import { byActive } from "@/stores/chats";
import { chatHead, draftHead, levelHead, seedHeads } from "./bucketHeads";

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
  /** 始める作業場所のワークツリーのフォルダ（なければ本体） */
  worktree?: string;
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
  /** worktree のときの作業場所の色（色相。ブランチの印と同じ workplaceHue。タブのまとまりの色に使う） */
  hue?: number;
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
  /** このまとまりのアーカイブ済み（archived: "nested" のとき、いちばん外の段だけ。なければ undefined。中は分けない） */
  archived?: ChatBucket<D>;
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
   * nested = いちばん外の段のまとまりごとに、その中の archived に入れる（サイドバーのグループ別・作業場所別。段がなければ bucket と同じ）/
   * drop = 入れない
   */
  archived?: "keep" | "bucket" | "nested" | "drop";
  /** 下書き。作成先のまとまりに入れる（いちばん外の段だけ） */
  drafts?: readonly D[];
  /** まとまりの中のチャットの並び（既定は最後に動いた順 byActive。ボードの並び順 chatComparator） */
  sort?: (a: Chat, b: Chat) => number;
  /** チャットも下書きもないまとまりも出すか（グループ = そのプロジェクトのグループすべてとグループなし、状態 = すべての列、プロジェクト = projects のすべて） */
  keepEmpty?: boolean | ((head: BucketHead) => boolean);
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

const ZERO_COUNTS: StateCounts = Object.freeze({ running: 0, needs_input: 0, unread: 0 });

const levelsOf = (by: BucketBy | readonly BucketBy[]): readonly BucketBy[] => (typeof by === "string" ? [by] : by);

/**
 * チャット（と下書き）をまとまりに分ける（純粋な関数。決まりはファイルの先頭）。
 * 例: サイドバーのグループ別 × 状態順 = bucketChats(chats, { by: ["group", "status"], project, pinned: true, archived: "bucket", ... })、
 * ボードの列 = bucketChats(chats, { by: "status", keepEmpty: true })、⌘⇧A = bucketChats(chats, { by: "status", columns: COUNTED_COLUMNS, archived: "drop" })
 */
export function bucketChats<D extends DraftTarget = DraftTarget>(chats: readonly Chat[], options: BucketOptions<D>): ChatBucket<D>[] {
  const own = (projectId: number) => options.project === undefined || projectId === options.project;
  const levels = levelsOf(options.by);
  const mine = chats.filter((c) => own(c.project_id));
  const drafts = (options.drafts ?? []).filter((d) => own(d.projectId));
  const top = { top: true, scope: options.project };
  if (options.archived !== "nested") return bucketLevel(mine, drafts, levels, options, top);
  // 段がなければ（まとめない）、今までどおり「アーカイブ済み」に抜き出す
  if (levels.length === 0) return bucketLevel(mine, drafts, levels, { ...options, archived: "bucket" }, top);
  const list = bucketLevel(
    mine.filter((c) => !c.archived_at),
    drafts,
    levels,
    { ...options, archived: "drop" },
    top,
  );
  // アーカイブ済みは、いちばん外の段だけで分けて（固定も抜き出さない）、同じキーのまとまりに入れる
  const archived = bucketLevel(
    mine.filter((c) => c.archived_at),
    [],
    levels.slice(0, 1),
    { ...options, pinned: false, archived: "keep", keepEmpty: false },
    top,
  );
  if (archived.length === 0) return list;
  const byKey = new Map(list.map((b) => [b.key, b]));
  for (const bucket of archived) {
    let owner = byKey.get(bucket.key);
    if (!owner) {
      // アーカイブ済みだけのまとまり（中身は空のまま。中の段も作らない）
      owner = { ...bucket, chats: [], drafts: [], counts: ZERO_COUNTS, children: undefined };
      byKey.set(bucket.key, owner);
      list.push(owner);
    }
    owner.archived = { ...bucket, key: `${bucket.key}/archived`, kind: "archived", label: "アーカイブ済み", title: "アーカイブ済みのチャット", counts: ZERO_COUNTS };
  }
  return sortBuckets(list, options.projects?.map((p) => p.id));
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
    bucket.chats.sort(options.sort ?? byActive);
    bucket.counts = stateCounts(bucket.chats, options.pending);
    // 固定はまとめずに並べ、アーカイブ済みの中はグループを除いた段で分ける（グループに関係なく並べる）
    const next = bucket.kind === "pinned" ? [] : bucket.kind === "archived" ? levels.filter((l) => l !== "group") : inner;
    if (next.length > 0 && bucket.kind !== "all") {
      bucket.children = bucketLevel(bucket.chats, [], next, { ...options, pinned: false, archived: "keep" }, { top: false, scope: bucket.projectId, parent: bucket.key });
    }
  }
  return list;
}

/**
 * まとまりに分けたチャットを、画面に並ぶ順の 1 列にする（中の段があればその順、なければまとまりのチャット。まとまりのアーカイブ済みはその後ろ）。
 * パネルのチャットのタブをサイドバーと同じ順に並べるのに使う
 */
export function flattenBucketChats(buckets: readonly ChatBucket[]): Chat[] {
  return buckets.flatMap((b) => [...(b.children ? flattenBucketChats(b.children) : b.chats), ...(b.archived ? flattenBucketChats([b.archived]) : [])]);
}

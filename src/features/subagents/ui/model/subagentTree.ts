// サブエージェントの入れ子（親子）。流れの中のカード・ピルの一覧・カードへ移るときに使う
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { SubagentEntry } from "@shared/chat/subagents";
import { ancestors, walkDown } from "@shared/foundation/tree";

/** サブエージェントの木（行のキーで引く・子を引く。子は起動した順） */
export interface SubagentTree {
  byKey: ReadonlyMap<string, SubagentEntry>;
  /** 子の一覧（キーが undefined ならメインエージェントが起動したもの） */
  children: ReadonlyMap<string | undefined, readonly SubagentEntry[]>;
}

const NO_CHILDREN: readonly SubagentEntry[] = [];

/** 一覧から木を作る（親が一覧にないもの（巻き戻したなど）は、メインエージェントが起動したものとして扱う） */
export function subagentTree(entries: readonly SubagentEntry[]): SubagentTree {
  const byKey = new Map(entries.map((s) => [s.key, s]));
  const children = new Map<string | undefined, SubagentEntry[]>();
  for (const s of entries) {
    const parent = s.parentKey !== undefined && byKey.has(s.parentKey) ? s.parentKey : undefined;
    const list = children.get(parent);
    if (list) list.push(s);
    else children.set(parent, [s]);
  }
  return { byKey, children };
}

/** 子の一覧（起動した順） */
export const childrenOf = (tree: SubagentTree, key: string | undefined): readonly SubagentEntry[] => tree.children.get(key) ?? NO_CHILDREN;

/** そのサブエージェントの記録の parent に入る呼び出し ID（行のキーと、再開した回の SendMessage の ID） */
export const scopeOf = (entry: SubagentEntry): readonly string[] => (entry.aliases?.length ? [entry.key, ...entry.aliases] : [entry.key]);

/** いちばん外側から、そのサブエージェントまでの道筋（自分を含む。見つからなければ空） */
export function pathOf(tree: SubagentTree, key: string): SubagentEntry[] {
  const entry = tree.byKey.get(key);
  return entry ? [...ancestors(entry, (s) => (s.parentKey === undefined ? undefined : tree.byKey.get(s.parentKey))), entry] : [];
}

/** 一覧に並べる順（親のすぐ下に子を、深さ付きで。いちばん外側は新しいものを上に、子は起動した順） */
export function flattenTree(tree: SubagentTree): { entry: SubagentEntry; depth: number }[] {
  const rows: { entry: SubagentEntry; depth: number }[] = [];
  walkDown([...childrenOf(tree, undefined)].reverse(), (s) => childrenOf(tree, s.key), (entry, depth) => void rows.push({ entry, depth }));
  return rows;
}

/**
 * いまの動き（いちばん新しいツールの呼び出し）。そのサブエージェントと、その中で起動したサブエージェント（子孫）の記録から探す。
 * 子孫のものなら、その子孫の行も返す（「洗い出し › 検索: …」と出すため）。まだ何もしていなければ undefined
 */
export function latestActivity(
  tree: SubagentTree,
  key: string,
  events: readonly ChatEvent[],
): { use: Extract<ChatEvent, { type: "tool_use" }>; by?: SubagentEntry } | undefined {
  const owner = new Map<string, SubagentEntry | undefined>();
  const root = tree.byKey.get(key);
  if (!root) return undefined;
  walkDown([root], (s) => childrenOf(tree, s.key), (entry) => {
    for (const id of scopeOf(entry)) owner.set(id, entry === root ? undefined : entry);
  });
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "tool_use" && e.data.parent !== undefined && owner.has(e.data.parent)) return { use: e, by: owner.get(e.data.parent) };
  }
  return undefined;
}

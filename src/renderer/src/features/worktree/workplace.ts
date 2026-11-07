import type { GitWorktree, Chat } from "@shared/types";
import { baseName } from "@/lib/format";

/** ワークツリーのブランチ名（ブランチから外れていれば "HEAD a1b2c3d"） */
export const branchName = (w: GitWorktree) => w.branch ?? `HEAD ${w.head.slice(0, 7)}`;

/**
 * チャットの作業場所の種類。main: 本体 / worktree: ワークツリー /
 * missing: ワークツリーのフォルダが見つからない（アプリの外で消された）/ past: 本体に戻ったが、最後に作業したのは別のブランチ（片付けたあとなど）
 */
export type WorkplaceKind = "main" | "worktree" | "missing" | "past";

/** 見出しなどの補足に出す、作業場所の種類の名前 */
export const WORKPLACE_KIND_LABELS: Record<WorkplaceKind, string> = {
  main: "本体",
  worktree: "ワークツリー",
  missing: "フォルダなし",
  past: "以前のブランチ",
};

/**
 * ブランチの印の先頭に出す、作業場所の短い名前（印は作業場所が主で、ブランチ名はその後ろの補足）。
 * フォルダなしは消えたワークツリー、以前のブランチは本体なので、それぞれ WT・本体（点線の枠で見分け、理由は説明に出す）
 */
export const WORKPLACE_SHORT_LABELS: Record<WorkplaceKind, string> = {
  main: "本体",
  worktree: "WT",
  missing: "WT",
  past: "本体",
};

export interface ChatWorkplace {
  /** まとめるときのキー（同じ作業場所なら同じ） */
  key: string;
  kind: WorkplaceKind;
  /** ブランチ名（分からなければフォルダ名。Git でない本体は空） */
  name: string;
  /** マウスを乗せたときの説明 */
  title: string;
}

/**
 * チャットの作業場所とブランチ（ブランチの印・作業場所でまとめたときの見出し・段で共通）。
 * ブランチ名はいまのワークツリーの一覧から引き、見つからないとき（片付けた・消した）は、チャットが最後に作業したブランチ（chats.branch）を出す
 */
export function workplaceOf(chat: Pick<Chat, "worktree_path" | "branch">, list: GitWorktree[] | undefined): ChatWorkplace {
  const path = chat.worktree_path;
  if (path) {
    const wt = list?.find((w) => w.path === path);
    if (wt && !wt.prunable) return { key: path, kind: "worktree", name: branchName(wt), title: `ブランチ: ${branchName(wt)}\n作業場所: ワークツリー（${path}）` };
    // 一覧を読み込み終わって見つからない・フォルダが消えている
    if (wt || list) {
      const name = wt?.branch ?? (chat.branch || baseName(path));
      return { key: path, kind: "missing", name, title: `ブランチ: ${name}\n作業場所: ワークツリー（${path}）のフォルダが見つかりません。アプリの外で消された可能性があります` };
    }
    const name = chat.branch || baseName(path);
    return { key: path, kind: "worktree", name, title: `ブランチ: ${name}\n作業場所: ワークツリー（${path}）` };
  }
  const main = list?.find((w) => w.main);
  const mainBranch = main ? branchName(main) : null;
  // 本体に戻ったチャット（ワークツリーを片付けた・消した）は、最後に作業したブランチでまとめる
  if (chat.branch && mainBranch && chat.branch !== mainBranch) {
    return {
      key: `branch:${chat.branch}`,
      kind: "past",
      name: chat.branch,
      title: `最後に作業したブランチ: ${chat.branch}\n作業場所: 本体（いまのブランチは ${mainBranch}。ワークツリーを片付けたあとなど）`,
    };
  }
  const name = mainBranch ?? chat.branch ?? "";
  return { key: "", kind: "main", name, title: `ブランチ: ${name || "不明"}\n作業場所: 本体` };
}

/** 作業場所でまとめるときの並び: 本体 → ワークツリー（名前順）→ フォルダなし → 以前のブランチ */
const KIND_ORDER: Record<WorkplaceKind, number> = { main: 0, worktree: 1, missing: 2, past: 3 };
export const compareWorkplaces = (a: ChatWorkplace, b: ChatWorkplace) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name);

/**
 * 同じ作業場所（worktreePath。null = 本体）で作業中のチャットの数（except のチャットは数えない）。
 * 同じフォルダで同時に作業すると、ファイルがぶつかることがあるので知らせるのに使う（チャットの画面・新しいチャットで共通）
 */
export function countBusyAt(chats: readonly Pick<Chat, "id" | "worktree_path" | "status">[], worktreePath: string | null, except?: number): number {
  let count = 0;
  for (const chat of chats) if (chat.id !== except && chat.worktree_path === worktreePath && chat.status === "running") count++;
  return count;
}

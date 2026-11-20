import type { Chat } from "@shared/chat/types";
import type { GitWorktree } from "@shared/git/types";
import { baseName } from "@/foundation/ui/lib/format";

/** ワークツリーのブランチ名（ブランチから外れていれば "HEAD a1b2c3d"） */
export const branchName = (w: GitWorktree) => w.branch ?? `HEAD ${w.head.slice(0, 7)}`;

/**
 * チャットの作業場所の種類。main: 本体 / worktree: ワークツリー /
 * missing: ワークツリーのフォルダが見つからない（アプリの外で消された）。
 * ワークツリーを片付けて本体に戻ったチャットは本体（片付けたブランチは乗せたときの説明にだけ出す）
 */
export type WorkplaceKind = "main" | "worktree" | "missing";

/** 見出しなどの補足に出す、作業場所の種類の名前 */
export const WORKPLACE_KIND_LABELS: Record<WorkplaceKind, string> = {
  main: "本体",
  worktree: "ワークツリー",
  missing: "フォルダなし",
};

/**
 * ブランチの印の先頭に出す、作業場所の短い名前（印は作業場所が主で、ブランチ名はその後ろの補足）。
 * フォルダなしは消えたワークツリーなので WT（点線の枠で見分け、理由は説明に出す）
 */
export const WORKPLACE_SHORT_LABELS: Record<WorkplaceKind, string> = {
  main: "本体",
  worktree: "WT",
  missing: "WT",
};

/** 作業場所を決めるのに使うチャットの項目（片付けた印は、まだ送っていない新しいチャットなどにはないので省ける） */
export type WorkplaceChat = Pick<Chat, "worktree_path" | "branch"> & Partial<Pick<Chat, "finished_worktree_branch">>;

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
 * 色と種類は作業場所で決め、ブランチ名はいまのブランチを出す（本体のチャットは、chats.branch が違っても本体のいまのブランチ）。
 * 一覧にないとき（読み込む前・アプリの外で消された）は、チャットが最後に作業したブランチ（chats.branch）を仮に出す。
 * ワークツリーを片付けて本体に戻ったチャット（finished_worktree_branch。次に送るまで）は、片付けたブランチを説明に添える
 */
export function workplaceOf(chat: WorkplaceChat, list: GitWorktree[] | undefined): ChatWorkplace {
  const path = chat.worktree_path;
  if (path) {
    const wt = list?.find((w) => w.path === path);
    if (wt && !wt.prunable) return { key: path, kind: "worktree", name: branchName(wt), title: `ブランチ: ${branchName(wt)}\n作業場所: ワークツリー（${path}）` };
    // 一覧を読み込み終わって見つからない・フォルダが消えている
    if (wt || list) {
      const name = wt?.branch ?? (chat.branch || baseName(wt?.root ?? path));
      return { key: path, kind: "missing", name, title: `ブランチ: ${name}\n作業場所: ワークツリー（${path}）のフォルダが見つかりません。アプリの外で消された可能性があります` };
    }
    const name = chat.branch || baseName(path);
    return { key: path, kind: "worktree", name, title: `ブランチ: ${name}\n作業場所: ワークツリー（${path}）` };
  }
  const main = list?.find((w) => w.main);
  const mainBranch = main ? branchName(main) : null;
  // 片付けたチャットの chats.branch は片付けたワークツリーのブランチなので、一覧を読む前の仮の名前にも使わない
  const name = mainBranch ?? (chat.finished_worktree_branch ? "" : (chat.branch ?? ""));
  const history = chat.finished_worktree_branch ? `\n以前の作業場所: ワークツリー（ブランチ ${chat.finished_worktree_branch}。片付けて本体に戻しました）` : "";
  return { key: "", kind: "main", name, title: `ブランチ: ${name || "不明"}\n作業場所: 本体${history}` };
}

/** 作業場所でまとめるときの並び: 本体 → ワークツリー（名前順）→ フォルダなし */
const KIND_ORDER: Record<WorkplaceKind, number> = { main: 0, worktree: 1, missing: 2 };
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

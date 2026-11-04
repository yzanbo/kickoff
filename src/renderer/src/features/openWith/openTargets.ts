// パネルのタブの列からブラウザ・ターミナルを開くときの、開く先の決め方（useOpenWithMenu が使う。どれも押したペインで見せている表示中のタブから決める）
import type { Chat } from "@shared/types";
import { baseName } from "@/lib/format";
import type { PanelTab, TerminalTarget } from "@/features/panel/tabs/panelTypes";

/**
 * ターミナルを開く場所: 見せているタブがチャットならその作業場所（ワークツリーならそのフォルダ、本体ならプロジェクトのフォルダ）、
 * そうでなければ開く場所が 1 つならそこ。決まらなければ undefined（開く場所を選ぶメニューを出す）。chat は見せているチャットのタブのチャット
 */
export function terminalTargetOf(shown: PanelTab | undefined, chat: Chat | undefined, targets: readonly TerminalTarget[]): TerminalTarget | undefined {
  if (shown?.kind === "chat") {
    if (chat?.worktree_path) return { cwd: chat.worktree_path, label: baseName(chat.worktree_path), projectId: chat.project_id };
    const main = targets.find((t) => t.projectId === (chat?.project_id ?? shown.projectId));
    if (main) return main;
  }
  return targets.length === 1 ? targets[0] : undefined;
}

/** 外のブラウザで開くページ: 見せているタブがブラウザなら、そのいまのページ（なければ undefined = ブラウザを開くだけ） */
export const browserPageOf = (shown: PanelTab | undefined): string | undefined => (shown?.kind === "browser" ? (shown.current ?? shown.url) : undefined);

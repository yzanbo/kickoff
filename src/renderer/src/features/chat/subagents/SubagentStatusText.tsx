import type { SubagentEntry } from "@shared/chat/subagents";
import { cx } from "@/lib/cx";
import { showsSubagentStatus, subagentStatusClass, subagentStatusLabel, subagentStatusTitle } from "./subagentList";

/**
 * サブエージェントの状態の文（流れの中のカードの見出し・右の欄の画面の見出し・入力欄の上の一覧の行で共通）。色は状態ごと（subagentStatusClass）、
 * やり直し済みは乗せると止まった理由。親が受け取った完了（いつもの完了）は出さない。prefix は文の前に付ける区切り（一覧の行の「 · 」）
 */
export function SubagentStatusText({ entry, prefix = "" }: { entry: SubagentEntry; prefix?: string }) {
  if (!showsSubagentStatus(entry)) return null;
  return (
    <span className={cx("subagent-status", subagentStatusClass(entry))} title={subagentStatusTitle(entry)}>
      {prefix}
      {subagentStatusLabel(entry)}
    </span>
  );
}

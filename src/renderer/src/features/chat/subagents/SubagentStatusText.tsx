import type { SubagentEntry } from "@shared/chat/subagents";
import { cx } from "@/lib/cx";
import { showsSubagentStatus, subagentStatusClass, subagentStatusLabel, subagentStatusTitle } from "./subagentList";
import { useSubagentsView } from "./subagentsContext";

/**
 * サブエージェントの状態の文（流れの中のカードの見出し・右の欄の画面の見出し・入力欄の上の一覧の行で共通）。色は状態ごと（subagentStatusClass）、
 * 回答待ちの依頼を出していれば「回答待ち」、やり直し済みは乗せると止まった理由。親が受け取った完了（いつもの完了）は出さない。prefix は文の前に付ける区切り（一覧の行の「 · 」）
 */
export function SubagentStatusText({ entry, prefix = "" }: { entry: SubagentEntry; prefix?: string }) {
  // 回答待ちの依頼を出していれば「回答待ち」（チャットの画面の中だけ分かる）
  const waiting = useSubagentsView()?.waiting.has(entry.key) ?? false;
  if (!showsSubagentStatus(entry, waiting)) return null;
  return (
    <span className={cx("subagent-status", subagentStatusClass(entry, waiting))} title={subagentStatusTitle(entry)}>
      {prefix}
      {subagentStatusLabel(entry, waiting)}
    </span>
  );
}

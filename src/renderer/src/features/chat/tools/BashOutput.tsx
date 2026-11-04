import { useState } from "react";
import { clipLines, parseBashResult } from "./bashResult";

/** 閉じた状態で出す出力の行数（残りは「… ほか n 行」を押すと出す） */
const SHOWN_LINES = 30;

/**
 * コマンド（Bash）の呼び出しを開いたときの中身: 「$ コマンド」と出力を 1 つの枠に等幅で並べる。
 * 出力がなければ「出力なし」、失敗したら終了コード（取れなければ「失敗」）を赤で出す
 */
export function BashOutput({
  command,
  result,
  rel,
}: {
  command: string;
  result?: { content?: string; is_error?: boolean };
  rel: (s: string) => string;
}) {
  const [showAll, setShowAll] = useState(false);
  const parsed = result ? parseBashResult(result.content ?? "", Boolean(result.is_error)) : null;
  const { shown, hidden } = parsed ? (showAll ? { shown: parsed.output, hidden: 0 } : clipLines(parsed.output, SHOWN_LINES)) : { shown: "", hidden: 0 };
  return (
    <>
      <pre className="bash-text">
        <span className="bash-command">
          <span className="bash-prompt">$ </span>
          {rel(command)}
        </span>
        {parsed && "\n"}
        {parsed && (shown ? rel(shown) : <span className="bash-empty">出力なし</span>)}
      </pre>
      {hidden > 0 && (
        <button type="button" className="link-button bash-more" onClick={() => setShowAll(true)}>
          … ほか {hidden} 行
        </button>
      )}
      {parsed?.failed && <div className="bash-exit">{parsed.exitCode !== undefined ? `終了コード ${parsed.exitCode}` : "失敗"}</div>}
    </>
  );
}

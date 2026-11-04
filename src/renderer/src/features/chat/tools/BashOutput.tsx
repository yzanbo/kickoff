import { useState } from "react";
import { HighlightedCode } from "@/ui/HighlightedCode";
import { clipLines, parseBashResult } from "./bashResult";

/** 閉じた状態で出す出力の行数（残りは「… ほか n 行」を押すと出す） */
const SHOWN_LINES = 30;

/**
 * コマンド（Bash）の呼び出しを開いたときの中身: 「$ コマンド」と出力を 1 つの枠に等幅で並べる。
 * コマンドはシェルの文法で色を付け（heredoc の本文は、分かればその言語で）、出力は色を付けない。
 * 出力がなければ「出力なし」、失敗したら終了コード（取れなければ「失敗」）を赤で出す
 */
export function BashOutput({
  command,
  result,
  rel,
  highlight,
}: {
  command: string;
  result?: { content?: string; is_error?: boolean };
  rel: (s: string) => string;
  /** コマンドに色を付けるか（一度でも開いたら。閉じたままの呼び出しでは色付けを始めない） */
  highlight: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const parsed = result ? parseBashResult(result.content ?? "", Boolean(result.is_error)) : null;
  const { shown, hidden } = parsed ? (showAll ? { shown: parsed.output, hidden: 0 } : clipLines(parsed.output, SHOWN_LINES)) : { shown: "", hidden: 0 };
  return (
    <>
      <pre className="bash-text">
        <span className="bash-command">
          <span className="bash-prompt">$ </span>
          <HighlightedCode code={rel(command)} lang={highlight ? "shellscript" : undefined} />
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

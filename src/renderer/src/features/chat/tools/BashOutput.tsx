import { useState } from "react";
import { HighlightedCode } from "@/ui/HighlightedCode";
import { clipLines, parseBashResult } from "./bashResult";
import { outputLanguage } from "./toolResultParse";

/** 閉じた状態で出す出力の行数（残りは「… ほか n 行」を押すと出す） */
const SHOWN_LINES = 30;

/**
 * コマンド（Bash）の呼び出しを開いたときの中身: 上に「コマンド」の欄（「$ コマンド」）、下に「出力」の欄を、見出しと地の色で分けて並べる
 * （長いコマンド・heredoc と出力の境目が分かるように。それぞれの欄の中でスクロールする）。
 * コマンドはシェルの文法で色を付け（heredoc の本文は、分かればその言語で）、出力も中身に合わせて色を付ける
 * （JSON・差分・ファイルの中身を出すだけのコマンドはその言語、ほかはログの形。決め方は toolResultParse の outputLanguage）。
 * 出力がなければ「出力なし」、失敗したら終了コード（取れなければ「失敗」）を出力の見出しの右に赤で出す。結果が届くまでは出力の欄を出さない
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
  /** コマンドと出力に色を付けるか（一度でも開いたら。閉じたままの呼び出しでは色付けを始めない） */
  highlight: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const parsed = result ? parseBashResult(result.content ?? "", Boolean(result.is_error)) : null;
  const { shown, hidden } = parsed ? (showAll ? { shown: parsed.output, hidden: 0 } : clipLines(parsed.output, SHOWN_LINES)) : { shown: "", hidden: 0 };
  return (
    <div className="bash-block">
      <BashCommandSection command={command} rel={rel} highlight={highlight} />
      {parsed && (
        <section className="bash-section bash-result" aria-label="出力">
          <div className="bash-section-head">
            出力
            {parsed.failed && <span className="bash-exit">{parsed.exitCode !== undefined ? `終了コード ${parsed.exitCode}` : "失敗"}</span>}
          </div>
          <pre className="bash-text">
            {shown ? <HighlightedCode code={rel(shown)} lang={highlight ? outputLanguage(command, parsed.output) : undefined} /> : <span className="bash-empty">出力なし</span>}
          </pre>
          {hidden > 0 && (
            <button type="button" className="link-button bash-more" onClick={() => setShowAll(true)}>
              … ほか {hidden} 行
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/** 「コマンド」の欄（「$ コマンド」。結果の欄と、実行中の出力の枠 CommandLive で共通） */
export function BashCommandSection({ command, rel, highlight }: { command: string; rel: (s: string) => string; highlight: boolean }) {
  return (
    <section className="bash-section" aria-label="コマンド">
      <div className="bash-section-head">コマンド</div>
      <pre className="bash-text bash-command">
        <span className="bash-prompt">$ </span>
        <HighlightedCode code={rel(command)} lang={highlight ? "shellscript" : undefined} />
      </pre>
    </section>
  );
}

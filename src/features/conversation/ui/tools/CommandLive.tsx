import { useLayoutEffect, useRef } from "react";
import { BashCommandSection } from "./BashOutput";

/** いちばん下に付いていると見なす、下の端からの距離 */
const STICK_PX = 8;

/**
 * 実行中のコマンドの枠（Claude Code が書いている出力を、終わる前から流す。保存しない）。終わったあとの BashOutput と同じ形で、
 * 上に「コマンド」の欄（何を打ったか）、下に「出力」の欄（見出しに「実行中」。いまどうなっているか）を並べる。
 * 出力はいちばん下に付いていき、中で上へ戻したら止まる（いちばん下へ戻せばまた付いていく。ターミナルと同じ）。終わると消え、結果はツールの結果で出る
 */
export function CommandLive({ command, text, rel }: { command: string; text: string; rel: (s: string) => string }) {
  const ref = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <div className="command-live bash-block">
      <BashCommandSection command={command} rel={rel} highlight />
      <section className="bash-section bash-result" aria-label="実行中のコマンドの出力">
        <div className="bash-section-head">
          出力
          <span className="command-live-state">
            <span className="spinner small" aria-hidden />
            実行中
          </span>
        </div>
        <pre
          ref={ref}
          className="bash-text command-live-output"
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_PX;
          }}
        >
          {rel(text) || <span className="bash-empty">出力を待っています…</span>}
        </pre>
      </section>
    </div>
  );
}

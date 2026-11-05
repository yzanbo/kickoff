import { useLayoutEffect, useRef } from "react";

/** いちばん下に付いていると見なす、下の端からの距離 */
const STICK_PX = 8;

/**
 * 実行中のコマンドの出力の最後の行（Claude Code が書いている出力を、終わる前から流す。保存しない）。
 * いちばん下に付いていき、中で上へ戻したら止まる（いちばん下へ戻せばまた付いていく。ターミナルと同じ）。終わると消え、結果はツールの結果で出る
 */
export function CommandLive({ text, rel }: { text: string; rel: (s: string) => string }) {
  const ref = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <pre
      ref={ref}
      className="command-live"
      aria-label="実行中のコマンドの出力"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_PX;
      }}
    >
      {rel(text) || <span className="command-live-empty">出力を待っています…</span>}
    </pre>
  );
}

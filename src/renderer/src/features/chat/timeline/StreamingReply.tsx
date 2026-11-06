import { useLayoutEffect } from "react";
import { useStreamReveal } from "@/hooks/useStreamReveal";
import { Markdown } from "@/ui/markdown/Markdown";
import type { TimelineScroll } from "./timelineScroll";

/**
 * 書いている途中の返答（流れの終わり）。届いた塊のまま一度に出さず、少しずつ流れるように出し、出たばかりの文字は薄く出してすぐ濃くする
 * （`useStreamReveal`。後ろにカーソルの印は付けない）。
 * 出す文はフレームごとに伸びるので、一番下を見ているときは、この部品の中で付いていく（流れ全体を描き直さない）
 */
export function StreamingReply({ text, scroll }: { text: string; scroll: TimelineScroll }) {
  const reveal = useStreamReveal(text);
  useLayoutEffect(() => {
    const el = scroll.ref.current;
    if (el && scroll.following()) el.scrollTop = el.scrollHeight;
  }, [reveal.text, scroll]);
  if (!reveal.text) return null;
  return (
    <div className="assistant live">
      <Markdown streaming tail={reveal.bands}>
        {reveal.text}
      </Markdown>
    </div>
  );
}

import { useLayoutEffect, useMemo } from "react";
import { useStreamReveal } from "@/hooks/useStreamReveal";
import { Markdown } from "@/ui/markdown/Markdown";
import type { TimelineScroll } from "./timelineScroll";

/**
 * 書いている途中の返答（流れの終わり）。届いた塊のまま一度に出さず、少しずつ流れるように出し、出たばかりの文字は薄く出してすぐ濃くする
 * （`useStreamReveal`。後ろにカーソルの印は付けない）。
 * 出す文はフレームごとに伸びるので、一番下を見ているときは、この部品の中で付いていく（流れ全体を描き直さない）。
 * Markdown は出す文で作り置く（届いた文・親の描き直しでは解析し直さない）。
 * 見えていない間（パネルの裏のタブ・閉じたパネル・動きに切り替えた会話。visible が false）は少しずつ出さず、表に出たら最新の文から出す
 */
export function StreamingReply({ text, visible, scroll }: { text: string; visible: boolean; scroll: TimelineScroll }) {
  const reveal = useStreamReveal(text, visible);
  useLayoutEffect(() => {
    const el = scroll.ref.current;
    if (el && scroll.following()) el.scrollTop = el.scrollHeight;
  }, [reveal.text, scroll]);
  // 出す文（reveal は少しずつ出すたびに新しい物になる）が同じなら作り直さない。届いた文・親の描き直しで同じ文を解析し直さない
  const body = useMemo(
    () => (
      <Markdown streaming tail={reveal.bands}>
        {reveal.text}
      </Markdown>
    ),
    [reveal],
  );
  if (!reveal.text) return null;
  return <div className="assistant live">{body}</div>;
}

import { useMemo } from "react";
import { streamingSource, useChatStreamGen } from "@/features/chat/store/useChatStore";
import { useStreamReveal } from "@/hooks/useStreamReveal";
import { createMarkdownRevealLimit } from "@/lib/markdownReveal";
import { Markdown } from "@/ui/markdown/Markdown";

/**
 * 書いている途中の返答（流れの終わり）。届いた塊のまま一度に出さず、少しずつ流れるように出し、出たばかりの文字は薄く出してすぐ濃くする
 * （`useStreamReveal`。後ろにカーソルの印は付けない）。
 * 出す文はフレームごとに伸びる。一番下への付いていきは、流れの中身の大きさの知らせで行う（useFollowBottom。ここでは scrollHeight を読まない）。
 * Markdown は出す文で作り置く（届いた文・親の描き直しでは解析し直さない）。
 * 見えていない間（パネルの裏のタブ・閉じたパネル・動きに切り替えた会話。visible が false）は少しずつ出さず、表に出たら最新の文から出す。
 * 書きかけの記号は生の文字で出さない（強調・コードは閉じの記号を補い、リンクの行き先・表・数式などは手前で止める。`createMarkdownRevealLimit`）。
 * 文はチャットの店の途中の文の口から、記録の口で選んだ世代の分を rAF の中で読む（React の state・props に入れない。確定した返答と同じ描き直しで世代が進み、
 * この部品は外れる。メモの仕様書「0023_表示を軽くする」の M1・案 2）
 */
export function StreamingReply({ chatId, visible }: { chatId: number; visible: boolean }) {
  const gen = useChatStreamGen(chatId);
  const source = streamingSource(chatId, gen);
  const reveal = useStreamReveal(source.read, source.subscribe, visible, createMarkdownRevealLimit);
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

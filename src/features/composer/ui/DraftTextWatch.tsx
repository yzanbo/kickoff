import { useEffect, useEffectEvent } from "react";
import { useDraftText, type ComposerDraft } from "./composerDraft";

/** 書いている文を知らせるまで待つ時間（打つたびに知らせない） */
const TEXT_CHANGE_DELAY_MS = 300;

/**
 * 下書きの文が変わったら少し待ってから知らせる（新しいチャットの下書きのカードに出すため。何も描かない）。
 * 置く側を打つたびに描き直さないよう、読むのはこの部品だけ。onChange は描くたびに替わってよい（いつも最新を呼ぶ）
 */
export function DraftTextWatch({ draft, onChange }: { draft: ComposerDraft; onChange: (text: string) => void }) {
  const [text] = useDraftText(draft);
  const changed = useEffectEvent((value: string) => onChange(value));
  useEffect(() => {
    const timer = setTimeout(() => changed(text), TEXT_CHANGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return null;
}

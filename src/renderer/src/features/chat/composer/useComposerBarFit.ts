import { useCallback } from "react";
import { cx } from "@/lib/cx";
import { useOverflowCompact } from "@/hooks/useOverflowCompact";

/**
 * チャット欄の下の行（左の道具と選択・右の操作）を 1 行に収める段階（決め打ちの欄の幅では切り替えない。useOverflowCompact）:
 * 1 行に入らなくなったら、まず fit-narrow（▾ を消し、推論の深さ・権限モードをアイコンだけに）、それでも入らなければ fit-tight
 * （送り方の切り替え「あとで / いま」もアイコンだけに）。前は欄の幅 560px / 420px で切り替えていたので、作業中に右の操作
 * （送り方の切り替え・中断）が増えると、アイコンになる前に左の道具が 2 行に折り返した。
 * contentKey は、欄の幅が変わらなくても中身の幅が変わるもの（作業中か・選んだモデルなど）。変わったら測り直す
 */
export function useComposerBarFit(contentKey: string) {
  const narrow = useOverflowCompact<HTMLDivElement>(contentKey);
  // 2 段目は、1 段目で詰めた中身の幅で測る（1 段目が変わったら測り直す）
  const tight = useOverflowCompact<HTMLDivElement>(`${contentKey}|${narrow.compact}`);
  const { ref: narrowRef } = narrow;
  const { ref: tightRef } = tight;
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      narrowRef.current = el;
      tightRef.current = el;
    },
    [narrowRef, tightRef],
  );
  return { ref, className: cx(narrow.compact && "fit-narrow", narrow.compact && tight.compact && "fit-tight") };
}

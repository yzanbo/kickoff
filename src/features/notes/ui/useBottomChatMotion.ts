import { useLayoutEffect, useRef, useState } from "react";

/**
 * ノートのチャットを本文の下に置いたときの開け閉めの動き（styles/editor/note-chat.css の `.chat-bottom.chat-moved`）。
 * 下の入力欄は同じ場所に止めたまま、上の会話の部分だけを伸び縮みさせる: 開くときはノートの下の入力欄（NoteQuickChat）をすぐ隠し、
 * 欄をその入力欄の高さから伸ばす（欄の入力欄がちょうど同じ所に出る）。閉じるときは欄をその高さまで縮めてから入れ替える。
 * - quickRef: ノートの下の入力欄の入れ物（高さを測る。畳んでいる間も中身は描いたままなので測れる）
 * - quickHeight: その高さ（px。`--note-quick-h`）
 * - moved: 開け閉めしたあとか（読み込んだとき・置き場所を変えたときは動かさない）
 */
export function useBottomChatMotion(open: boolean, bottom: boolean) {
  // 入れ物は読み込みが済んでから描くので、ref ではなく state で受けて、出てきたら測り始める
  const [quickEl, quickRef] = useState<HTMLDivElement | null>(null);
  const [quickHeight, setQuickHeight] = useState(0);
  useLayoutEffect(() => {
    if (!quickEl) return;
    const measure = () => setQuickHeight(quickEl.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(quickEl);
    return () => observer.disconnect();
  }, [quickEl]);
  // 開け閉めしたら、描く前に動きのクラスを付ける（useLayoutEffect なので、付けずに一度描いてしまうことがない）
  const [moved, setMoved] = useState(false);
  const last = useRef({ open, bottom });
  useLayoutEffect(() => {
    const prev = last.current;
    last.current = { open, bottom };
    if (prev.bottom !== bottom) setMoved(false);
    else if (prev.open !== open) setMoved(true);
  }, [open, bottom]);
  return { quickRef, quickHeight, moved: moved && bottom };
}

import { useEffect, useRef, useState } from "react";
import { nextRevealLength, REVEAL_FADE_MS, revealBands, type RevealMark } from "@/lib/streamReveal";

const IDLE = { text: "", bands: [] as number[] };

/**
 * 伸びていく文（生成中の返答）を、届いた塊のまま一度に出さず、フレームごとに少しずつ出す（遅れが大きいほど速く追いつく）。
 * 返すのは、いま出す文と、出たばかりの文字を出てからの時間で分けた段の数（新しい順。`Markdown` の `tail` に渡して薄く出す）。
 * 前の文の続きでなければ（別の返答・空になった）初めから。動きを減らす設定のときは、そのまま出す
 */
export function useStreamReveal(target: string): { text: string; bands: number[] } {
  const [view, setView] = useState(IDLE);
  const state = useRef({ source: "", shown: 0, marks: [] as RevealMark[], frame: 0, last: 0 });

  useEffect(() => {
    const s = state.current;
    if (!target.startsWith(s.source.slice(0, s.shown))) {
      s.shown = 0;
      s.marks = [];
    }
    s.source = target;
    if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      s.shown = target.length;
      setView(target ? { text: target, bands: [] } : IDLE);
      return;
    }
    const tick = (now: number) => {
      const dt = s.last ? now - s.last : 16;
      s.last = now;
      s.shown = nextRevealLength(s.source, s.shown, dt);
      s.marks.push({ at: now, length: s.shown });
      // 薄く出す時間より古い記録は、境にする 1 つだけ残す
      while (s.marks.length > 1 && s.marks[1].at <= now - REVEAL_FADE_MS) s.marks.shift();
      const bands = revealBands(s.marks, now);
      setView({ text: s.source.slice(0, s.shown), bands });
      // 出し切って、薄い文字もなくなったら止める（次に文が伸びたら、また動かす）
      if (s.shown < s.source.length || bands.some((n) => n > 0)) s.frame = requestAnimationFrame(tick);
      else {
        s.frame = 0;
        s.last = 0;
      }
    };
    if (!s.frame) s.frame = requestAnimationFrame(tick);
  }, [target]);

  // 外したら止める（予約の印も戻す。StrictMode などで付け直したとき、予約済みと思い込んで動かなくならないように）
  useEffect(() => {
    const s = state.current;
    return () => {
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      s.last = 0;
    };
  }, []);
  return view;
}

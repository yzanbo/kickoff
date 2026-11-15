import { startTransition, useEffect, useRef, useState } from "react";
import { nextRevealLength, REVEAL_FADE_MS, revealBands, type RevealMark } from "@/lib/streamReveal";

const IDLE = { text: "", bands: [] as number[] };
type View = typeof IDLE;

/** 出す文の描き直しを、急がない更新で当てる（hook の状態は増やさないので useTransition ではなく startTransition） */
function show(set: (view: View) => void, view: View) {
  startTransition(() => set(view));
}

/**
 * 伸びていく文（生成中の返答）を、届いた塊のまま一度に出さず、フレームごとに少しずつ出す（遅れが大きいほど速く追いつく）。
 * 返すのは、いま出す文と、出たばかりの文字を出てからの時間で分けた段の数（新しい順。`Markdown` の `tail` に渡して薄く出す）。
 * 前の文の続きでなければ（別の返答・空になった）初めから。動きを減らす設定のときは、そのまま出す。
 * visible が false の間（見えていないチャット）は rAF を回さず描き直さない。表に出たら、そのときの最新の文を一度に出す
 * （裏で溜まった分を少しずつ流し直さない。メモの仕様書「0023_表示を軽くする」の案 6a）。
 * 出す文の描き直しは急がない更新（startTransition）で当てる。キー入力などの急ぐ更新が来たら、React は途中の文の描き直しを後回しにして入力を先に描く
 * （入力していなければ、ほかに待つものがないのですぐ描く。メモの仕様書「0023_表示を軽くする」の案 5）
 */
export function useStreamReveal(target: string, visible = true): { text: string; bands: number[] } {
  const [view, setView] = useState(IDLE);
  const state = useRef({ source: "", shown: 0, marks: [] as RevealMark[], frame: 0, last: 0, paused: false });

  useEffect(() => {
    const s = state.current;
    if (!target.startsWith(s.source.slice(0, s.shown))) {
      s.shown = 0;
      s.marks = [];
    }
    s.source = target;
    if (!visible) {
      // 見えていない: 止めて、表に出るまで描き直さない
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      s.last = 0;
      s.paused = true;
      return;
    }
    if (s.paused) {
      // 表に出た: 最新の文を一度に出す（ここから先に届いた分は、また少しずつ）
      s.paused = false;
      s.shown = target.length;
      s.marks = [];
      show(setView, target ? { text: target, bands: [] } : IDLE);
      return;
    }
    if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      s.shown = target.length;
      show(setView, target ? { text: target, bands: [] } : IDLE);
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
      show(setView, { text: s.source.slice(0, s.shown), bands });
      // 出し切って、薄い文字もなくなったら止める（次に文が伸びたら、また動かす）
      if (s.shown < s.source.length || bands.some((n) => n > 0)) s.frame = requestAnimationFrame(tick);
      else {
        s.frame = 0;
        s.last = 0;
      }
    };
    if (!s.frame) s.frame = requestAnimationFrame(tick);
  }, [target, visible]);

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

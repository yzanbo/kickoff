import { useEffect, useRef, type RefObject } from "react";
import { isComposing } from "@/lib/keys";

interface DismissOptions {
  /** false の間は何もしない（開いているときだけ有効にする） */
  enabled?: boolean;
  /** 外側の mousedown で閉じるか（既定は閉じる） */
  outside?: boolean;
  /** このセレクタに当たる要素の mousedown では閉じない（開閉ボタン自体など。そちらで開閉する） */
  ignore?: string;
  /**
   * Esc の扱い
   * - "stop": 先に受け取って閉じ、ほかの Esc（パネルを閉じるなど）には伝えない（重なったいちばん上だけ閉じる）
   * - "pass": 閉じたうえで、ほかの Esc にも伝える
   * - "none": Esc では閉じない
   */
  escape?: "stop" | "pass" | "none";
}

/** 外側のクリックで閉じるものが開いている数（開いている間は、ウィンドウのドラッグ領域を止める） */
let openCount = 0;

/**
 * 外側のクリックで閉じるものが開いている間、<html> に data-dismissable を付ける（layout.css でドラッグ領域を止める）。
 * Electron のドラッグ領域（見出しの行など）を押しても、ページにはクリックが届かず（ウィンドウのドラッグになる）閉じなかったため
 */
function holdDragRegions(): () => void {
  openCount += 1;
  document.documentElement.dataset.dismissable = "";
  return () => {
    openCount -= 1;
    if (openCount === 0) delete document.documentElement.dataset.dismissable;
  };
}

/**
 * ポップオーバー・メニューなどを、外側のクリックと Esc で閉じる。
 * ref の要素（いくつか渡せば、そのどれか。ポップオーバーと開いたボタンなど）の中のクリックでは閉じない
 * （ウィンドウのドラッグ領域のクリックでも閉じるよう、開いている間はドラッグ領域を止める）
 */
export function useDismiss(ref: RefObject<HTMLElement | null> | readonly RefObject<HTMLElement | null>[], onDismiss: () => void, options: DismissOptions = {}) {
  const { enabled = true, outside = true, ignore, escape = "stop" } = options;
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const refs = useRef(ref);
  refs.current = ref;

  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const inside = Array.isArray(refs.current) ? refs.current : [refs.current as RefObject<HTMLElement | null>];
      if (inside.some((r) => r.current?.contains(target))) return;
      if (ignore && target.closest?.(ignore)) return;
      dismiss.current();
    };
    const onKey = (e: KeyboardEvent) => {
      // 日本語入力の変換をやめる Esc では閉じない（検索欄で変換をやめただけで、一覧が閉じないように）
      if (e.key !== "Escape" || isComposing(e)) return;
      if (escape === "stop") e.stopImmediatePropagation();
      dismiss.current();
    };
    if (outside) window.addEventListener("mousedown", onDown);
    const release = outside ? holdDragRegions() : undefined;
    // "stop" はほかより先に受け取るため、捕捉フェーズで聞く
    const capture = escape === "stop";
    if (escape !== "none") window.addEventListener("keydown", onKey, capture);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, capture);
      release?.();
    };
  }, [enabled, outside, ignore, escape]);
}

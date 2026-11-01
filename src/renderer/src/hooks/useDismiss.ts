import { useEffect, useRef, type RefObject } from "react";

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

/**
 * ポップオーバー・メニューなどを、外側のクリックと Esc で閉じる。
 * ref の要素の中のクリックでは閉じない
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, onDismiss: () => void, options: DismissOptions = {}) {
  const { enabled = true, outside = true, ignore, escape = "stop" } = options;
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current?.contains(target)) return;
      if (ignore && target.closest?.(ignore)) return;
      dismiss.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (escape === "stop") e.stopImmediatePropagation();
      dismiss.current();
    };
    if (outside) window.addEventListener("mousedown", onDown);
    // "stop" はほかより先に受け取るため、捕捉フェーズで聞く
    const capture = escape === "stop";
    if (escape !== "none") window.addEventListener("keydown", onKey, capture);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, capture);
    };
  }, [enabled, outside, ignore, escape, ref]);
}

import { useState, type MouseEvent } from "react";
import { clampToViewport } from "../PopupMenu";

/**
 * ボタンの下に出すメニューの開閉と位置（タブの列の＋・見出しの選択肢・プロジェクトの切り替えなど）。
 * buttonSelector は開くボタンのセレクタ（PopupMenu の ignore に渡す。外側のクリックとして閉じず、ボタンの側で開閉する）。
 * width はメニューの幅（align が right なら、ボタンの右端にそろえる）。高さは項目の数で変わるので、開くときに渡す
 */
export function useAnchoredMenu(buttonSelector: string, width: number, align: "left" | "right" = "left") {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return {
    /** 開いている位置（閉じていれば null。PopupMenu の x / y に展開する） */
    at,
    isOpen: at !== null,
    /** PopupMenu の ignore に渡す */
    ignore: buttonSelector,
    close: () => setAt(null),
    /** 開くボタンの onClick（開いているときに押したら閉じる）。height はメニューのおおよその高さ（画面からはみ出さない位置にするため） */
    toggle: (e: MouseEvent<HTMLElement>, height: number) => {
      if (at) return setAt(null);
      const r = e.currentTarget.getBoundingClientRect();
      setAt(clampToViewport(align === "right" ? r.right - width : r.left, r.bottom + 4, width, height));
    },
  };
}

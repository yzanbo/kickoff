import { useState, type MouseEvent } from "react";
import { anchorPlacement, type FloatingAlign, type FloatingSide, type Placement } from "@/lib/floating";

/** 開いているメニュー（置く場所と、開いた対象） */
export interface OpenMenu<T> {
  at: Placement;
  value: T;
}

/**
 * 右クリック・「…」・▾ で開くメニューの開閉と置き場所（PopupMenu の at に渡す）。value は開いた対象（チャット・グループなど。なければ省く）。
 * - open(e, value): 右クリックの位置に開く（既定の右クリックのメニューは出さない）
 * - openBelow(e, value): 押したボタンの下（side・align・gap。既定は下・左端そろえ・4px 離す）に開く
 * - toggle(e, value): openBelow と同じで、開いているときに押したら閉じる（PopupMenu の ignore にボタンのセレクタを渡す。
 *   外側のクリックとして閉じたあと、続くクリックで開き直さないため）
 * メニューは描いてから自分の大きさを測って画面に収めるので、呼ぶ側で大きさを見積もらない
 */
export function useContextMenu<T = void>({ side, align, gap }: { side?: FloatingSide; align?: FloatingAlign; gap?: number } = {}) {
  const [menu, setMenu] = useState<OpenMenu<T> | null>(null);
  const openBelow = (e: MouseEvent<HTMLElement>, value: T) => setMenu({ at: anchorPlacement(e.currentTarget, { side, align, gap }), value });
  return {
    menu,
    isOpen: menu !== null,
    close: () => setMenu(null),
    open: (e: MouseEvent, value: T) => {
      e.preventDefault();
      setMenu({ at: { x: e.clientX, y: e.clientY }, value });
    },
    openBelow,
    toggle: (e: MouseEvent<HTMLElement>, value: T) => (menu ? setMenu(null) : openBelow(e, value)),
    /** 決めた場所に開く（開いていたメニューと同じ場所に続けて開くときなど） */
    openAt: (at: Placement, value: T) => setMenu({ at, value }),
  };
}

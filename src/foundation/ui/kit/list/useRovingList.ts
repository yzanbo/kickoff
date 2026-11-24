import { useEffect, useId, useState, type Dispatch, type KeyboardEvent, type RefObject, type SetStateAction } from "react";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { isComposing } from "@/foundation/ui/lib/keys";

/**
 * ↑↓（横の組は ←→）で位置を 1 つ動かす。候補・メニュー・選ぶ欄で同じ決まり: 端では回り込む（最後の次は先頭、先頭から戻ると最後。
 * macOS のメニューと同じ）。まだ選んでいなければ（index が範囲の外）、↓ で先頭・↑ で最後。候補がなければ -1
 */
export function stepIndex(index: number, step: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (index < 0 || index >= count) return step > 0 ? 0 : count - 1;
  return (index + step + count) % count;
}

/** 動く向き（vertical = ↑↓・horizontal = ←→） */
export type RovingOrientation = "vertical" | "horizontal";

/** キーが位置を動かす向き（動かさないキーは null） */
export function rovingStep(key: string, orientation: RovingOrientation = "vertical"): 1 | -1 | null {
  const [next, back] = orientation === "vertical" ? ["ArrowDown", "ArrowUp"] : ["ArrowRight", "ArrowLeft"];
  return key === next ? 1 : key === back ? -1 : null;
}

/** 入力欄にピントを置いたまま、候補の位置（index）を動かす（候補・パレット）。候補が変わったら、呼ぶ側で setIndex(0) する */
export interface ActiveDescendantOptions<K> {
  mode: "activeDescendant";
  keys: readonly K[];
  /** Enter で決める（位置に候補がなければ undefined） */
  onPick(key: K | undefined): void;
}

export interface ActiveDescendantList {
  index: number;
  setIndex: Dispatch<SetStateAction<number>>;
  /** 入力欄の keydown（↑↓ で動かし、Enter で決める。日本語入力の変換中のキーは見ない） */
  onKeyDown(e: KeyboardEvent<HTMLElement>): void;
  /** 入力欄の aria-activedescendant（位置に候補がなければ undefined） */
  activeId: string | undefined;
  /** 候補（role="option"）の id と aria-selected */
  optionProps(index: number): { id: string; "aria-selected": boolean };
}

/** 項目にピントを移す（メニュー・Segmented）。項目は入れ物の中の要素から拾う */
export interface FocusOptions {
  mode: "focus";
  /** 入れ物（省けば keydown を受けた要素。global・focusSelf では渡す） */
  ref?: RefObject<HTMLElement | null>;
  orientation?: RovingOrientation;
  /** 動ける項目（既定: 入れ物の中の押せるボタン）。from はいまピントのある要素 */
  items?(root: HTMLElement, from: Element | null): HTMLElement[];
  /** 窓の keydown を先に（捕捉で）受ける。ピントが入れ物の外にあっても動かす（開いたメニュー） */
  global?: boolean;
  /** 付けたとき入れ物そのものにピントを置き、項目は選んでいない状態から始める（開いたメニュー） */
  focusSelf?: boolean;
  /** ピントを移した項目（Segmented は移した項目を選ぶ） */
  onMove?(item: HTMLElement): void;
}

export interface FocusList {
  /** 入れ物の keydown（global なら付けなくてよい） */
  onKeyDown(e: KeyboardEvent<HTMLElement>): void;
}

const pressableButtons = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>("button:not(:disabled)")];

function useActiveDescendant<K>(o: ActiveDescendantOptions<K> | null): ActiveDescendantList {
  const [index, setIndex] = useState(0);
  const baseId = useId();
  const count = o?.keys.length ?? 0;
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // 変換中の ↑↓（候補を選ぶ）・Enter（確定する）は、変換に使う
    if (!o || isComposing(e)) return;
    const step = rovingStep(e.key);
    if (step !== null) {
      e.preventDefault();
      setIndex((i) => stepIndex(i, step, count));
    } else if (e.key === "Enter") {
      e.preventDefault();
      o.onPick(o.keys[index]);
    }
  };
  return {
    index,
    setIndex,
    onKeyDown,
    activeId: index >= 0 && index < count ? `${baseId}-${index}` : undefined,
    optionProps: (i) => ({ id: `${baseId}-${i}`, "aria-selected": i === index }),
  };
}

function useFocusList(o: FocusOptions | null): FocusList {
  const ref = o?.ref;
  const focusSelf = o?.focusSelf ?? false;
  useEffect(() => {
    const root = ref?.current;
    if (!focusSelf || !root) return;
    // Esc・↑↓ を入れ物で受け取れるよう、入れ物そのものにピントを置く。先頭の項目に置くと、直前にキーを使っていたとき、
    // 右クリックで開いただけでも先頭の項目にピントの枠が出るため
    root.setAttribute("tabindex", "-1");
    root.focus({ preventScroll: true });
  }, [ref, focusSelf]);
  const move = (e: { key: string; currentTarget: EventTarget | null; preventDefault(): void }) => {
    const root = o?.ref ? o.ref.current : e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    const step = o ? rovingStep(e.key, o.orientation) : null;
    if (!o || !root || step === null) return;
    e.preventDefault();
    const active = document.activeElement;
    const list = (o.items ?? pressableButtons)(root, active);
    const next = list[stepIndex(list.indexOf(active as HTMLElement), step, list.length)];
    if (!next) return;
    next.focus();
    o.onMove?.(next);
  };
  useWindowEvent("keydown", move, Boolean(o?.global), true);
  return { onKeyDown: move };
}

/**
 * キーで動く位置。mode で 2 つの形がある: activeDescendant = 入力欄にピントを置いたまま位置を動かす（候補・パレット）/
 * focus = 項目にピントを移す（メニュー・Segmented）
 */
export function useRovingList<K>(o: ActiveDescendantOptions<K>): ActiveDescendantList;
export function useRovingList(o: FocusOptions): FocusList;
export function useRovingList<K>(o: ActiveDescendantOptions<K> | FocusOptions): ActiveDescendantList | FocusList {
  const descendant = useActiveDescendant(o.mode === "activeDescendant" ? o : null);
  const focus = useFocusList(o.mode === "focus" ? o : null);
  return o.mode === "focus" ? focus : descendant;
}

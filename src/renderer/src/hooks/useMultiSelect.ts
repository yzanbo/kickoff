import { useState } from "react";

/** クリックの修飾キー（MouseEvent の一部） */
interface Modifiers {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

/** order の中の from から to までの並び（from がない・order に見つからなければ to だけ） */
export function rangeOf<K>(order: readonly K[], from: K | null, to: K): K[] {
  const a = from === null ? -1 : order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** 選んでいるもの（picked）に keys を足す（並びは選んだ順。重ねない） */
export function addKeys<K>(picked: readonly K[], keys: readonly K[]): K[] {
  return [...new Set([...picked, ...keys])];
}

/**
 * 一覧の複数選択（サイドバーのチャット・送信待ちの指示で共通）。決まりは 1 つ:
 * ⌘ / Ctrl ＋クリックで 1 つずつ足す・外す（起点にする）、Shift ＋クリックで起点から押したものまでの範囲を、いま選んでいるものに足す
 * （選んだものは減らさない。起点がなければ押したものから）。ふつうのクリックは選ぶのをやめる（呼ぶ側はふだんの動きをする）。
 * order は範囲を決める並び（サイドバーは画面の並び、送信待ちは列の順）。existing はいまある項目で、消えたものは選択から外す。
 * selected は existing の並びで返す
 */
export function useMultiSelect<K>(existing: readonly K[], order: () => readonly K[]) {
  const [picked, setPicked] = useState<readonly K[]>([]);
  const [anchor, setAnchor] = useState<K | null>(null);
  const alive = new Set(existing);
  const pickedSet = new Set(picked);
  const selected = existing.filter((k) => pickedSet.has(k));
  const ids = new Set(selected);
  // 続けて呼んでも取りこぼさないよう、いまの値から足す・外す（消えた項目はそのときに外す）
  const update = (change: (now: readonly K[]) => readonly K[]) => setPicked((prev) => change(prev.filter((k) => alive.has(k))));

  const toggle = (key: K) => {
    update((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));
    setAnchor(key);
  };
  const extend = (key: K) => {
    update((now) => addKeys(now, rangeOf(order(), anchor, key)));
    if (anchor === null) setAnchor(key);
  };
  const add = (key: K) => {
    update((now) => addKeys(now, [key]));
    if (anchor === null) setAnchor(key);
  };
  const clear = () => {
    if (picked.length > 0) setPicked([]);
    setAnchor(null);
  };
  return {
    /** 選んでいるもの（existing の並び） */
    selected,
    ids,
    has: (key: K) => ids.has(key),
    toggle,
    /** 起点からこれまでの範囲を足す */
    extend,
    /** 選んでいるものに足す（キーボードの Shift+↑↓） */
    add,
    clear,
    /**
     * 行のクリック: ⌘ / Ctrl なら足す・外す、Shift なら範囲を足して true（選ぶ操作をした）。
     * 修飾キーがなければ選ぶのをやめて false（呼ぶ側は開くなどのふだんの動きをする）
     */
    click: (e: Modifiers, key: K): boolean => {
      if (e.shiftKey) extend(key);
      else if (e.metaKey || e.ctrlKey) toggle(key);
      else {
        clear();
        return false;
      }
      return true;
    },
  };
}

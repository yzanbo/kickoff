import { useSyncExternalStore } from "react";
import { readSetting, storedIds, subscribeFamily, writeSetting, type SettingFamily } from "@/foundation/ui/storage";
import { storage as uiStorage } from "./storage";
import { useSetting } from "./useSetting";
import { useWindowEvent } from "./useWindowEvent";

// まとまりの開閉の覚え方（1 つだけ）。サイドバー・ボード・パネルのタブのまとまりで共通に、hooks/storage.ts の fold（ui:fold）に
// 「<場所>:<まとまりのキー>」で "1"（開いている）/ "0"（閉じている）を覚える。覚えていなければ、まとまりごとの初めの値（defaultOpen）。
// 場所は "sidebar"（サイドバー。「すべて閉じる / 開く」が効く）・"board:<ボード>"（ボードの段・列のアーカイブ済み）・"panel"（タブのまとまり。すべてのパネルで共通）・"composer"（入力欄の上のサブエージェント・子チャットの一覧のアーカイブ済み。すべてのチャットで共通）

const FOLD_ALL_EVENT = "kickoff:fold-all";

const foldId = (place: string, key: string) => `${place}:${key}`;

interface FoldOptions {
  /** 覚えていないときに開いているか（初めは開く。アーカイブ済みは閉じる） */
  defaultOpen?: boolean;
  /** 覚えた値に関係なく開いて見せる（検索・絞り込みの間） */
  forceOpen?: boolean;
}

/** 「すべて閉じる / 開く」を受け取る（その場所のものだけ。collapsed: 閉じるなら true） */
function useFoldAll(place: string, handler: (collapsed: boolean) => void) {
  useWindowEvent(FOLD_ALL_EVENT, (e) => {
    const { detail } = e as CustomEvent<{ place: string; collapsed: boolean }>;
    if (detail.place === place) handler(detail.collapsed);
  });
}

/**
 * まとまり 1 つの開閉（place: 場所、key: まとまりのキー）。その場所の「すべて閉じる / 開く」にも従う。
 * toggle は見えている開閉を逆にする（forceOpen で開いて見せている間に押すと、絞り込みをやめたときに閉じている）
 */
export function useFold(place: string, key: string, { defaultOpen = true, forceOpen = false }: FoldOptions = {}) {
  const [stored, setStored] = useSetting(uiStorage.settings.fold(foldId(place, key)));
  const open = forceOpen || (stored ?? defaultOpen);
  useFoldAll(place, (collapsed) => setStored(!collapsed));
  return { open, set: setStored, toggle: () => setStored(!open) };
}

const subscribeFolds = (listener: () => void) => subscribeFamily(uiStorage.settings.fold as SettingFamily<unknown>, listener);
const read = (place: string, key: string) => readSetting(uiStorage.settings.fold(foldId(place, key)));

/**
 * 同じ場所のいくつものまとまりの開閉（一覧の中で 1 つずつ hook を呼べないとき）。keys はこの部品で読むまとまりのキーで、
 * そのどれかが変わったときだけ描き直す（ほかの場所の開閉では描き直さない）。その場所の「すべて閉じる / 開く」では keys をそろえる
 * （描いていないまとまりのキーも渡してよい）。set は参照が変わらない（memo した部品に渡せる）
 */
export function useFolds(place: string, keys: readonly string[]) {
  const snapshot = useSyncExternalStore(subscribeFolds, () => JSON.stringify(keys.map((key) => [key, read(place, key)])));
  // 描画で読む値を購読した snapshot から作る。保存先を直接読むだけでは、React Compiler が isOpen と描画を使い回してしまう。
  const values = new Map<string, boolean | null>(JSON.parse(snapshot));
  const set = (key: string, open: boolean) => writeSetting(uiStorage.settings.fold(foldId(place, key)), open);
  const isOpen = (key: string, defaultOpen = true) => values.get(key) ?? defaultOpen;
  useFoldAll(place, (collapsed) => keys.forEach((key) => set(key, !collapsed)));
  return { isOpen, set, toggle: (key: string, defaultOpen = true) => set(key, !isOpen(key, defaultOpen)) };
}

/**
 * 場所の「すべて閉じる / 開く」（サイドバーの見出しの行）: その場所で覚えているまとまり（描いていないもの・閉じたプロジェクトの中も）をそろえ、
 * 描いているまとまり（useFold・useFolds の keys）にも知らせる
 */
export function foldAll(place: string, collapsed: boolean) {
  const prefix = `${place}:`;
  for (const id of storedIds(uiStorage.settings.fold)) if (id.startsWith(prefix)) writeSetting(uiStorage.settings.fold(id), !collapsed);
  window.dispatchEvent(new CustomEvent(FOLD_ALL_EVENT, { detail: { place, collapsed } }));
}

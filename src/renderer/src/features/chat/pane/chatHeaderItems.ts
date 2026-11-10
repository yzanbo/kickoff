import { hiddenItemsOf, sameHiddenItemsOf, toggleHiddenItem } from "@/lib/hiddenItems";

/**
 * チャットの見出しの行に出す項目（チャットの見出しの右クリックの「チャット画面表示」→「見出しに出す項目」で、項目ごとに表示・非表示を選ぶ）。
 * 覚えるのは隠した項目だけ（CHAT_HEADER_HIDDEN）なので、項目を増やしても初めは表示になる
 */
export const CHAT_HEADER_ITEMS = ["project", "group", "worktree", "showing", "textWidth", "fontSize", "sticky", "find", "turns", "cost", "agents"] as const;
export type ChatHeaderItem = (typeof CHAT_HEADER_ITEMS)[number];

export const CHAT_HEADER_ITEM_LABELS: Record<ChatHeaderItem, string> = {
  project: "プロジェクト",
  worktree: "作業場所（ブランチ）",
  group: "グループ",
  showing: "会話 / 動きの切り替え",
  textWidth: "会話の横幅",
  fontSize: "会話の文字の大きさ",
  sticky: "指示の帯の切り替え",
  find: "検索欄",
  turns: "ターン数",
  cost: "API 換算",
  agents: "右の欄の開閉",
};

/** 隠しても使えることの補足（メニューの項目に乗せたときに出す） */
export const CHAT_HEADER_ITEM_NOTES: Partial<Record<ChatHeaderItem, string>> = {
  showing: "隠しても、動きを見ている間は出します（会話へ戻れるように）",
  find: "隠しても、⌘F でチャットの右上に検索欄が出ます（文を消すと隠れます）",
};

/** メニューのまとまり（見出しの行の左から。まとまりの中の順は初めの並びで、ドラッグで並べ替えたら CHAT_HEADER_ORDER に覚える） */
export const CHAT_HEADER_SECTIONS: readonly { title: string; items: readonly ChatHeaderItem[] }[] = [
  { title: "バッジ", items: ["project", "group", "worktree"] },
  { title: "道具", items: ["showing", "textWidth", "fontSize", "sticky", "find"] },
  { title: "数", items: ["turns", "cost"] },
  { title: "右の欄", items: ["agents"] },
];

/** 保存した値から、知っている項目だけを取り出す（消した項目の名前が残っていても無視する） */
export const hiddenHeaderItems = (saved: readonly string[]): ReadonlySet<ChatHeaderItem> => hiddenItemsOf(CHAT_HEADER_ITEMS, saved);

/** 隠している項目が同じか（保存した値の順・知らない名前は見ない。「既定に戻す」を押せるかに使う） */
export const sameHiddenItems = (a: readonly string[], b: readonly string[]): boolean => sameHiddenItemsOf(CHAT_HEADER_ITEMS, a, b);

/** item の表示・非表示を入れ替えた、保存する値（項目の順にそろえる） */
export const toggleHeaderItem = (saved: readonly string[], item: ChatHeaderItem): string[] => toggleHiddenItem(CHAT_HEADER_ITEMS, saved, item);

/** 初めの並び（まとまりの順・まとまりの中の初めの順） */
const DEFAULT_ORDER: readonly ChatHeaderItem[] = CHAT_HEADER_SECTIONS.flatMap((s) => s.items);

/**
 * 覚えた並び（CHAT_HEADER_ORDER）で並べた、メニューのまとまり。並べ替えはまとまりの中だけなので、まとまりの順は変えない
 * （覚えていない項目・新しく足した項目は、初めの順のまま後ろへ。知らない名前は見ない）
 */
export function orderedHeaderSections(saved: readonly string[]): { title: string; items: ChatHeaderItem[] }[] {
  const rank = (item: ChatHeaderItem) => {
    const i = saved.indexOf(item);
    return i < 0 ? Infinity : i;
  };
  return CHAT_HEADER_SECTIONS.map(({ title, items }) => ({
    title,
    items: items
      .map((item, i) => ({ item, i }))
      .sort((a, b) => rank(a.item) - rank(b.item) || a.i - b.i)
      .map((x) => x.item),
  }));
}

/** 覚えた並びで、項目を並べ替える（見出しの行で、まとまりの中の項目を覚えた順に出す） */
export function sortHeaderItems<T extends ChatHeaderItem>(saved: readonly string[], items: readonly T[]): T[] {
  const order = orderedHeaderSections(saved).flatMap((s) => s.items);
  return [...items].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** 並べ替えが初めの並びのままか（「既定に戻す」を押せるかに使う） */
export function isDefaultHeaderOrder(saved: readonly string[]): boolean {
  return orderedHeaderSections(saved)
    .flatMap((s) => s.items)
    .every((item, i) => item === DEFAULT_ORDER[i]);
}

/**
 * 項目 moved を、同じまとまりの target の前・後ろへ動かした、保存する並び（ほかのまとまりの項目なら変えない）。
 * 初めの並びに戻ったら空にする（「既定に戻す」・タブの列の「表示」の「既定に戻す」で、初めの値と同じに見えるように）
 */
export function moveHeaderItem(saved: readonly string[], moved: ChatHeaderItem, target: ChatHeaderItem, side: "before" | "after"): string[] {
  const sections = orderedHeaderSections(saved).map(({ items }) => {
    if (moved === target || !items.includes(moved) || !items.includes(target)) return items;
    const rest = items.filter((i) => i !== moved);
    rest.splice(rest.indexOf(target) + (side === "after" ? 1 : 0), 0, moved);
    return rest;
  });
  const next = sections.flat();
  return next.every((item, i) => item === DEFAULT_ORDER[i]) ? [] : next;
}

/** 動かしても並びが変わらないか（すぐ前の後ろ・すぐ後ろの前・ほかのまとまり。線を出さない） */
export function isNoopHeaderMove(saved: readonly string[], moved: ChatHeaderItem, target: ChatHeaderItem, side: "before" | "after"): boolean {
  const before = orderedHeaderSections(saved).flatMap((s) => s.items);
  const after = orderedHeaderSections(moveHeaderItem(saved, moved, target, side)).flatMap((s) => s.items);
  return after.every((item, i) => item === before[i]);
}

/**
 * チャットの見出しの行に出す項目（タブの列の「表示」→「見出しの項目」で、項目ごとに表示・非表示を選ぶ）。
 * 覚えるのは隠した項目だけ（CHAT_HEADER_HIDDEN）なので、項目を増やしても初めは表示になる
 */
export const CHAT_HEADER_ITEMS = ["project", "group", "worktree", "showing", "textWidth", "fontSize", "sticky", "find", "turns", "cost", "agents"] as const;
export type ChatHeaderItem = (typeof CHAT_HEADER_ITEMS)[number];

export const CHAT_HEADER_ITEM_LABELS: Record<ChatHeaderItem, string> = {
  project: "プロジェクト",
  worktree: "作業場所（ブランチ）",
  group: "グループ",
  showing: "会話 / 動きの切り替え",
  textWidth: "文の幅",
  fontSize: "会話の文字の大きさ",
  sticky: "指示の帯の表示",
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

/** メニューのまとまり（見出しの行の左から） */
export const CHAT_HEADER_SECTIONS: readonly { title: string; items: readonly ChatHeaderItem[] }[] = [
  { title: "バッジ", items: ["project", "group", "worktree"] },
  { title: "道具", items: ["showing", "textWidth", "fontSize", "sticky", "find"] },
  { title: "数", items: ["turns", "cost"] },
  { title: "右の欄", items: ["agents"] },
];

/** 保存した値から、知っている項目だけを取り出す（消した項目の名前が残っていても無視する） */
export function hiddenHeaderItems(saved: readonly string[]): ReadonlySet<ChatHeaderItem> {
  return new Set(CHAT_HEADER_ITEMS.filter((i) => saved.includes(i)));
}

/** 隠している項目が同じか（保存した値の順・知らない名前は見ない。「既定に戻す」を押せるかに使う） */
export function sameHiddenItems(a: readonly string[], b: readonly string[]): boolean {
  const left = hiddenHeaderItems(a);
  const right = hiddenHeaderItems(b);
  return left.size === right.size && [...left].every((i) => right.has(i));
}

/** item の表示・非表示を入れ替えた、保存する値（項目の順にそろえる） */
export function toggleHeaderItem(saved: readonly string[], item: ChatHeaderItem): string[] {
  const hidden = hiddenHeaderItems(saved);
  return CHAT_HEADER_ITEMS.filter((i) => (i === item ? !hidden.has(i) : hidden.has(i)));
}

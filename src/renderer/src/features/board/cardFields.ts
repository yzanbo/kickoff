import type { Chat } from "@shared/types";
import { hiddenItemsOf, sameHiddenItemsOf, toggleHiddenItem } from "@/lib/hiddenItems";
import { contextRatio } from "./chatSort";

// ボードのカード・リストの行・フィードのカードに出す項目（ツールバーの「表示項目」で、項目ごとに出す・隠すを選ぶ。利用者の依頼）。
// 覚えるのは隠した項目だけ（BOARD_CARD_HIDDEN）。名前（チャット名）とアーカイブ済みの札はいつも出す

export const CARD_FIELDS = ["state", "project", "group", "worktree", "model", "pending", "turns", "cost", "context", "active", "created"] as const;
export type CardField = (typeof CARD_FIELDS)[number];

export const CARD_FIELD_LABELS: Record<CardField, string> = {
  state: "状態",
  project: "プロジェクト",
  group: "グループ",
  worktree: "作業場所（ブランチ）",
  model: "モデル",
  pending: "回答待ちの数",
  turns: "ターン数",
  cost: "API 換算",
  context: "コンテキスト",
  active: "最終更新",
  created: "作成日",
};

/** メニューのまとまり（プロジェクトは全プロジェクトのボードだけ: cardFieldSections） */
const SECTIONS: readonly { title: string; items: readonly CardField[] }[] = [
  { title: "バッジ", items: ["state", "project", "group", "worktree"] },
  { title: "詳細", items: ["model", "pending", "turns", "cost", "context"] },
  { title: "日時", items: ["active", "created"] },
];

/** そのボードのメニューのまとまり（プロジェクトのボードはプロジェクトが 1 つなので、プロジェクトを出さない） */
export const cardFieldSections = (allProjects: boolean) => SECTIONS.map((s) => ({ ...s, items: s.items.filter((f) => allProjects || f !== "project") }));

export const hiddenCardFields = (saved: readonly string[]): ReadonlySet<CardField> => hiddenItemsOf(CARD_FIELDS, saved);
export const sameHiddenCardFields = (a: readonly string[], b: readonly string[]): boolean => sameHiddenItemsOf(CARD_FIELDS, a, b);
export const toggleCardField = (saved: readonly string[], field: CardField): CardField[] => toggleHiddenItem(CARD_FIELDS, saved, field);

/** 詳細の数の文（値がない・0 なら undefined で出さない） */
export function cardStatText(chat: Chat, field: "turns" | "cost" | "context"): string | undefined {
  switch (field) {
    case "turns":
      return chat.num_turns > 0 ? `${chat.num_turns} ターン` : undefined;
    case "cost":
      return chat.cost_usd > 0 ? `$${chat.cost_usd.toFixed(2)}` : undefined;
    case "context": {
      const ratio = contextRatio(chat);
      return ratio === undefined ? undefined : `${Math.round(ratio * 100)}%`;
    }
  }
}

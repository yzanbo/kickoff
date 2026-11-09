import type { NamedView } from "@/lib/namedViews";
import { SIDEBAR_CHAT_ORDER, SIDEBAR_CHAT_SECTIONS, SIDEBAR_LAYOUT, SIDEBAR_PROJECT_ORDER, SIDEBAR_WAITING_VIEW } from "@/lib/storageKeys";

// サイドバーのビュー（プロジェクト一覧の上の見出しの見え方の組に名前を付けたもの。利用者の依頼で、見出しの 3 行をビューのタブ 1 行にした）。
// 読み書きは useSidebarViews、ここは形・読み方・比べ方（純粋な関数）。一覧の操作は lib/namedViews.ts

/** ビューに入れる見え方（見出しの 3 行のボタンの値。それぞれの設定と 1 対 1） */
export type SidebarViewState = {
  /** プロジェクトの並べ方（SIDEBAR_LAYOUT） */
  layout: (typeof SIDEBAR_LAYOUT.choices)[number];
  /** プロジェクトの並び順（SIDEBAR_PROJECT_ORDER） */
  projectOrder: (typeof SIDEBAR_PROJECT_ORDER.choices)[number];
  /** プロジェクトのカードを 1 行に（SIDEBAR_PROJECT_COMPACT） */
  projectCompact: boolean;
  /** しまったプロジェクトを出す（SIDEBAR_SHOW_ARCHIVED_PROJECTS） */
  showArchivedProjects: boolean;
  /** チャットのまとめ方（SIDEBAR_CHAT_SECTIONS） */
  grouping: (typeof SIDEBAR_CHAT_SECTIONS.choices)[number];
  /** チャットの並び順（SIDEBAR_CHAT_ORDER） */
  chatOrder: (typeof SIDEBAR_CHAT_ORDER.choices)[number];
  /** チャットの行を 1 行に（SIDEBAR_COMPACT） */
  chatCompact: boolean;
  /** アーカイブ済みのチャットを出す（SIDEBAR_SHOW_ARCHIVED） */
  showArchivedChats: boolean;
  /** 要対応のオン / オフ（SIDEBAR_WAITING_ONLY） */
  waitingOn: boolean;
  /** 要対応がオンのときの出し方 × 並べ方（SIDEBAR_WAITING_VIEW） */
  waitingView: (typeof SIDEBAR_WAITING_VIEW.choices)[number];
};

export type SidebarView = NamedView<SidebarViewState>;

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => list.includes(value as T);
const isBool = (value: unknown): value is boolean => typeof value === "boolean";

/** 保存した見え方を読む（合わない項目があれば undefined。そのビューは捨てる） */
export function parseSidebarViewState(value: unknown): SidebarViewState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (
    !oneOf(SIDEBAR_LAYOUT.choices, v.layout) ||
    !oneOf(SIDEBAR_PROJECT_ORDER.choices, v.projectOrder) ||
    !isBool(v.projectCompact) ||
    !isBool(v.showArchivedProjects) ||
    !oneOf(SIDEBAR_CHAT_SECTIONS.choices, v.grouping) ||
    !oneOf(SIDEBAR_CHAT_ORDER.choices, v.chatOrder) ||
    !isBool(v.chatCompact) ||
    !isBool(v.showArchivedChats) ||
    !isBool(v.waitingOn) ||
    !oneOf(SIDEBAR_WAITING_VIEW.choices, v.waitingView)
  ) {
    return undefined;
  }
  return {
    layout: v.layout,
    projectOrder: v.projectOrder,
    projectCompact: v.projectCompact,
    showArchivedProjects: v.showArchivedProjects,
    grouping: v.grouping,
    chatOrder: v.chatOrder,
    chatCompact: v.chatCompact,
    showArchivedChats: v.showArchivedChats,
    waitingOn: v.waitingOn,
    waitingView: v.waitingView,
  };
}

/** 保存したビューの一覧を読む（見え方の合わないものは捨てる） */
export function parseSidebarViews(list: readonly { id: string; name: string; state: unknown }[]): SidebarView[] {
  return list.flatMap((v) => {
    const state = parseSidebarViewState(v.state);
    return state ? [{ id: v.id, name: v.name, state }] : [];
  });
}

/** 同じ見え方か。要対応がオフどうしなら、オンのときの出し方 × 並べ方は比べない（見え方が変わらないので） */
export function sameSidebarViewState(a: SidebarViewState, b: SidebarViewState): boolean {
  return (
    a.layout === b.layout &&
    a.projectOrder === b.projectOrder &&
    a.projectCompact === b.projectCompact &&
    a.showArchivedProjects === b.showArchivedProjects &&
    a.grouping === b.grouping &&
    a.chatOrder === b.chatOrder &&
    a.chatCompact === b.chatCompact &&
    a.showArchivedChats === b.showArchivedChats &&
    a.waitingOn === b.waitingOn &&
    (!a.waitingOn || a.waitingView === b.waitingView)
  );
}

/** いまの見え方に合う、いちばん前のビュー */
export const activeSidebarView = (views: readonly SidebarView[], current: SidebarViewState) => views.find((v) => sameSidebarViewState(v.state, current));

/** 名前の決まっていない新しいビューの名前（「ビュー 1」から、同じ名前のない番号） */
export function newSidebarViewName(views: readonly SidebarView[]): string {
  const names = new Set(views.map((v) => v.name));
  for (let n = 1; ; n++) if (!names.has(`ビュー ${n}`)) return `ビュー ${n}`;
}

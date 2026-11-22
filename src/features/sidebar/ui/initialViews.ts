// サイドバーのビューの初めの値（保存の宣言は storage.ts。形は viewFields.ts の SidebarViewState）
import type { StoredView } from "@/foundation/ui/storage";

/**
 * サイドバーのビュー（プロジェクト・チャット・要対応の見え方の組に名前を付けたもの。viewFields.ts の SidebarViewState）。
 * 初めは「標準」「コンパクト」「要対応」の順。すべて消したら [] を覚え、初めのビューには戻さない（ボードの保存したビューと同じ）
 */
const sidebarView = (id: string, name: string, state: Readonly<Record<string, unknown>>): StoredView => ({
  id,
  name,
  state: {
    layout: "stack",
    projectOrder: "recent",
    projectCompact: false,
    showArchivedProjects: false,
    grouping: "group",
    chatOrder: "recent",
    chatCompact: false,
    showArchivedChats: false,
    waitingOn: false,
    waitingScope: "top",
    waitingOrder: "project",
    ...state,
  },
});
export const DEFAULT_SIDEBAR_VIEWS: readonly StoredView[] = [
  // 標準（先頭。初めはこれを選ぶ）: 縦スライド・2 行・チャットのアーカイブも出す・要対応を一覧の上に（プロジェクト別）
  sidebarView("default-sidebar-standard", "標準", { layout: "rail", showArchivedChats: true, waitingOn: true }),
  // コンパクト: 標準をプロジェクトもチャットも 1 行にし、チャットのアーカイブは隠す
  sidebarView("default-sidebar-compact", "コンパクト", { layout: "rail", projectCompact: true, chatCompact: true, waitingOn: true }),
  // 要対応: 縦並び・要対応のチャットだけ（プロジェクト別）
  sidebarView("default-sidebar-waiting", "要対応", { waitingOn: true, waitingScope: "only" }),
];

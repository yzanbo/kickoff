// このウィンドウで利用者が見ているもの（AI の get_user_view）を集める:
// 見ているプロジェクト・プロジェクトのタブ・画面に出ている欄（パネル）のペインごとの前のタブ・チャットの画面の右の欄に開いているもの。
// タブの中身の説明は種類の持ち主が userViewTabs に出す（tabDescribers.ts。エディタのカーソル・ノートで選んでいる文は lib/viewDetails から読む）
import type { UserView, UserViewPane, UserViewTab } from "@shared/userView/types";
import { knownChat } from "@/features/chat/ui/store/knownChats";
import { allPanels, isPanelMounted, kindOf, leavesOf, parsePanelKey, surfaceOf, terminalTitle, type PanelTab } from "@/features/panel/ui";
import type { PopoutRoute } from "@/foundation/ui/navigation/popout";
import { routeProjectId, type Route } from "@/foundation/ui/navigation/router";
import { readSetting } from "@/foundation/ui/storage";
import { dbClientTabs } from "@/foundation/ui/storage/storageKeys";
import { dbConnectionsStore } from "@/features/database/ui/state/connectionsStore";
import { editorView, githubView, noteView, userViewTabs } from "./tabDescribers";

/** プロジェクトのタブの名前（中身はパネル・設定から読むものを除く） */
const PROJECT_TAB_LABELS: Readonly<Record<string, string>> = {
  board: "ボード",
  chats: "チャット",
  files: "ファイル",
  search: "検索",
  changes: "変更（ソース管理）",
  history: "履歴",
  notes: "ノート",
  db: "DB",
  github: "GitHub",
  docker: "Docker",
  ci: "CI",
  trash: "ゴミ箱",
};

/** DB クライアントで前に出しているタブの接続とテーブル（place は DB クライアントの置き場所。DB のタブの説明（database の userViewTabs）も使う） */
export function databaseView(projectId: number, place: string): UserViewTab {
  const state = readSetting(dbClientTabs(place));
  const active = state.tabs.find((t) => t.key === state.active) ?? null;
  const connection = active ? (dbConnectionsStore.get(projectId).data?.find((c) => c.id === active.connection_id)?.name ?? `接続 ${active.connection_id}`) : null;
  return { kind: "database", connection, table: active?.kind === "table" ? active.name : null, project_id: projectId };
}

/** パネルのタブ 1 つの中身（種類の持ち主が userViewTabs に出した説明。なければ種類の名前の画面: プロジェクトの画面と同じ CI・Docker・ゴミ箱・ファイル・検索・履歴） */
function describePanelTab(tab: PanelTab): UserViewTab {
  const describer = userViewTabs.items().find((d) => d.kind === tab.kind);
  if (describer) return describer.describe(tab);
  const kind = kindOf(tab);
  const projectId = kind.projectOf(tab);
  return { kind: "page", label: kind.label(tab), ...(projectId !== undefined ? { project_id: projectId } : {}) };
}

/** プロジェクトのタブのペイン（チャットのタブはパネルのペインで出すので省く。ファイル・ノートの中身はファイル・ノートのタブのペインで出す） */
function projectTabPane(route: Route): UserViewPane | null {
  if (route.name !== "project" || route.tab === "chats") return null;
  const id = route.id;
  const tab: UserViewTab =
    route.tab === "github" ? githubView(id) : route.tab === "db" ? databaseView(id, `project-${id}`) : { kind: "page", label: PROJECT_TAB_LABELS[route.tab], project_id: id };
  return { area: "プロジェクトのタブ", tab };
}

/** 画面に出ている欄（閉じた欄・裏のプロジェクトの欄は入れない）のペインごとの前のタブと、右の欄に開いているもの */
function panelPanes(panes: UserViewPane[], side: UserViewTab[]) {
  for (const [key, state] of allPanels()) {
    const at = parsePanelKey(key);
    if (!at || !isPanelMounted(key) || !state.open) continue;
    const leaves = leavesOf(state.layout.root);
    const area = surfaceOf(at.surface)?.label ?? at.surface;
    const byKey = new Map(state.tabs.map((t) => [t.key, t]));
    leaves.forEach((leaf, i) => {
      const tab = leaf.active ? byKey.get(leaf.active) : undefined;
      panes.push({ area: leaves.length > 1 ? `${area}（${i + 1} つ目のペイン）` : area, tab: tab ? describePanelTab(tab) : null });
    });
    if (at.surface === "agents") side.push(...state.tabs.map(describePanelTab));
  }
}

/** メインのウィンドウで見ているもの */
export function collectUserView(route: Route): UserView {
  const panes: UserViewPane[] = [];
  const side: UserViewTab[] = [];
  const main = projectTabPane(route);
  if (main) panes.push(main);
  panelPanes(panes, side);
  return { project_id: routeProjectId(route), panes, side };
}

/** 別ウィンドウで見ているもの（ウィンドウの中身と、その中の右の欄） */
export function collectPopoutView(route: PopoutRoute): UserView {
  const chat = "chatId" in route && route.chatId !== undefined ? knownChat(route.chatId) : undefined;
  const projectId = "projectId" in route ? route.projectId : (chat?.project_id ?? null);
  const pid = projectId ?? undefined;
  const tab: UserViewTab =
    route.kind === "chat"
      ? { kind: chat?.parent_chat_id != null ? "child_chat" : "chat", chat_id: route.chatId, title: chat?.title ?? "", project_id: pid }
      : route.kind === "note"
        ? noteView(route.projectId, route.path)
        : route.kind === "file"
          ? editorView(route.projectId, route.path, route.worktree ?? null, route.line)
          : route.kind === "changes"
            ? { kind: "changes", worktree: route.worktree ?? null, focus: route.focus ?? null, project_id: route.projectId }
            : route.kind === "database"
              ? databaseView(route.projectId, `chat-${route.chatId}`)
              : route.kind === "sidebar"
                ? { kind: "page", label: "サイドバー" }
                : route.kind === "side"
                  ? { kind: "page", label: "チャット欄" }
                  : route.kind === "browser"
                    ? { kind: "browser", url: route.url, title: route.title, ...(route.projectId !== null ? { project_id: route.projectId } : {}) }
                    : route.kind === "terminal"
                      ? { kind: "terminal", label: terminalTitle(route), project_id: route.projectId }
                      : { kind: "subagent", title: "サブエージェント" };
  const panes: UserViewPane[] = [{ area: "別ウィンドウ", tab }];
  const side: UserViewTab[] = [];
  panelPanes(panes, side);
  return { project_id: projectId, panes, side };
}

/** 別ウィンドウで開いているチャット */
export function popoutChatIds(view: UserView, route: PopoutRoute): number[] {
  const ids = new Set<number>("chatId" in route && route.chatId !== undefined ? [route.chatId] : []);
  for (const tab of [...view.panes.map((p) => p.tab), ...view.side]) if (tab && (tab.kind === "chat" || tab.kind === "child_chat")) ids.add(tab.chat_id);
  return [...ids];
}

/** このウィンドウで開いているチャット（AI がどのウィンドウを読むかを決める。見えているペインと右の欄のチャット・子チャット） */
export function chatIdsOf(view: UserView, route: Route): number[] {
  const ids = new Set<number>();
  if (route.name === "chat") ids.add(route.chatId);
  for (const tab of [...view.panes.map((p) => p.tab), ...view.side]) if (tab && (tab.kind === "chat" || tab.kind === "child_chat")) ids.add(tab.chat_id);
  return [...ids];
}

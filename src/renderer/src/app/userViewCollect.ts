// このウィンドウで利用者が見ているもの（AI の get_user_view。メモの仕様書「0019_AI の操作ツールの追加」の D）を集める:
// 見ているプロジェクト・プロジェクトのタブ・画面に出ている欄（パネル）のペインごとの前のタブ・チャットの画面の右の欄に開いているもの。
// タブの中身のうち部品だけが知っているもの（エディタのカーソルと選んでいる範囲・メモで選んでいる文）は lib/viewDetails から読む
import { USER_VIEW_TEXT_MAX, type UserView, type UserViewPane, type UserViewTab } from "@shared/types";
import { readSetting } from "@/lib/storage";
import { dbClientTabs, githubSelected } from "@/lib/storageKeys";
import { editorCursorOf, memoSelectionOf } from "@/lib/viewDetails";
import { dbConnectionsStore } from "@/stores/dbConnections";
import { knownChat } from "@/stores/chats";
import { allPanels, isPanelMounted } from "@/features/panel/state/panelStore";
import { leavesOf } from "@/features/panel/layout/paneTree";
import { parsePanelKey, type PanelSurface } from "@/features/panel/surfaces";
import { PROJECT_VIEW_LABELS, type PanelTab } from "@/features/panel/tabs/panelTypes";
import type { PopoutRoute } from "./popout";
import type { ProjectTab, Route } from "./router";

/** 欄の呼び名（AI に返す文の「どこのペインか」） */
const AREA_LABELS: Record<PanelSurface, string> = {
  board: "チャットのパネル",
  side: "ボードの右のパネル",
  bottom: "下のパネル",
  agents: "チャットの画面の右の欄",
  memos: "メモのタブ",
  files: "ファイルのタブ",
};

/** プロジェクトのタブの名前（中身はパネル・設定から読むものを除く） */
const PROJECT_TAB_LABELS: Record<ProjectTab, string> = {
  board: "ボード",
  chats: "チャット",
  files: "ファイル",
  search: "検索",
  changes: "変更（ソース管理）",
  history: "履歴",
  memos: "メモ",
  db: "DB",
  github: "GitHub",
  docker: "Docker",
  ci: "CI",
  trash: "ゴミ箱",
};

/** 選んだ文は長ければ切る */
const clip = (s: string | null) => (s !== null && s.length > USER_VIEW_TEXT_MAX ? `${s.slice(0, USER_VIEW_TEXT_MAX)}…` : s);

/** GitHub のタブ・右の欄で開いている issue・PR（「issue:12」「pr:5」） */
function githubTab(projectId: number): UserViewTab {
  const m = /^(issue|pr):(\d+)$/.exec(readSetting(githubSelected(projectId)));
  return { kind: "github", item: m ? { kind: m[1] as "issue" | "pr", number: Number(m[2]) } : null, project_id: projectId };
}

/** DB クライアントで前に出しているタブの接続とテーブル（place は DB クライアントの置き場所） */
function databaseTab(projectId: number, place: string): UserViewTab {
  const state = readSetting(dbClientTabs(place));
  const active = state.tabs.find((t) => t.key === state.active) ?? null;
  const connection = active ? (dbConnectionsStore.get(projectId).data?.find((c) => c.id === active.connection_id)?.name ?? `接続 ${active.connection_id}`) : null;
  return { kind: "database", connection, table: active?.kind === "table" ? active.name : null, project_id: projectId };
}

/** エディタのタブ（カーソルと選んでいる範囲は開いている部品から） */
function editorTab(projectId: number, path: string, worktree: string | null, line: number | undefined): UserViewTab {
  const cursor = editorCursorOf(projectId, path);
  return { kind: "editor", path, worktree, line: cursor?.line ?? line ?? null, selection: cursor?.selection ?? null, project_id: projectId };
}

/** パネルのタブ 1 つの中身 */
function describeTab(tab: PanelTab): UserViewTab {
  switch (tab.kind) {
    case "chat":
      return { kind: "chat", chat_id: tab.id, title: tab.title ?? tab.chat?.title ?? knownChat(tab.id)?.title ?? "", project_id: tab.projectId };
    case "new":
      return { kind: "new_chat", project_id: tab.projectId };
    case "subagent":
      return { kind: "subagent", title: tab.title };
    case "changes":
      return { kind: "changes", worktree: tab.worktree ?? null, focus: tab.focus ?? null, project_id: tab.projectId };
    case "file":
      return editorTab(tab.projectId, tab.path, tab.worktree ?? null, tab.line);
    case "projectView":
      return { kind: "page", label: PROJECT_VIEW_LABELS[tab.view], project_id: tab.projectId };
    case "projectFile":
      return editorTab(tab.projectId, tab.path, null, tab.line);
    case "memo":
      return { kind: "memo", path: tab.path, selected_text: clip(memoSelectionOf(tab.projectId, tab.path)), project_id: tab.projectId };
    case "database":
      return databaseTab(tab.projectId, `chat-${tab.chatId}`);
    case "github":
      return githubTab(tab.projectId);
    case "child":
      return { kind: "child_chat", chat_id: tab.childId, title: tab.title, project_id: tab.projectId };
    case "newChild":
      return { kind: "page", label: "新しい子チャット（送る前）", project_id: tab.projectId };
    case "browser":
      return { kind: "browser", url: tab.current ?? tab.url, title: tab.title };
    case "terminal":
      return { kind: "terminal", label: tab.title ?? tab.label, project_id: tab.projectId };
  }
}

/** 見ているプロジェクト（全プロジェクトの画面なら null） */
export function projectOfRoute(route: Route): number | null {
  if (route.name === "project") return route.id;
  if (route.name === "chat" || route.name === "newChat") return route.projectId;
  return null;
}

/** プロジェクトのタブのペイン（チャットのタブはパネルのペインで出すので省く。ファイル・メモの中身はファイル・メモのタブのペインで出す） */
function projectTabPane(route: Route): UserViewPane | null {
  if (route.name !== "project" || route.tab === "chats") return null;
  const id = route.id;
  const tab: UserViewTab =
    route.tab === "github" ? githubTab(id) : route.tab === "db" ? databaseTab(id, `project-${id}`) : { kind: "page", label: PROJECT_TAB_LABELS[route.tab], project_id: id };
  return { area: "プロジェクトのタブ", tab };
}

/** 画面に出ている欄（閉じた欄・裏のプロジェクトの欄は入れない）のペインごとの前のタブと、右の欄に開いているもの */
function panelPanes(panes: UserViewPane[], side: UserViewTab[]) {
  for (const [key, state] of allPanels()) {
    const at = parsePanelKey(key);
    if (!at || !isPanelMounted(key) || !state.open) continue;
    const leaves = leavesOf(state.layout.root);
    const byKey = new Map(state.tabs.map((t) => [t.key, t]));
    leaves.forEach((leaf, i) => {
      const tab = leaf.active ? byKey.get(leaf.active) : undefined;
      panes.push({ area: leaves.length > 1 ? `${AREA_LABELS[at.surface]}（${i + 1} つ目のペイン）` : AREA_LABELS[at.surface], tab: tab ? describeTab(tab) : null });
    });
    if (at.surface === "agents") side.push(...state.tabs.map(describeTab));
  }
}

/** メインのウィンドウで見ているもの */
export function collectUserView(route: Route): UserView {
  const panes: UserViewPane[] = [];
  const side: UserViewTab[] = [];
  const main = projectTabPane(route);
  if (main) panes.push(main);
  panelPanes(panes, side);
  return { project_id: projectOfRoute(route), panes, side };
}

/** 別ウィンドウで見ているもの（ウィンドウの中身と、その中の右の欄） */
export function collectPopoutView(route: PopoutRoute): UserView {
  const chat = "chatId" in route && route.chatId !== undefined ? knownChat(route.chatId) : undefined;
  const projectId = "projectId" in route ? route.projectId : (chat?.project_id ?? null);
  const pid = projectId ?? undefined;
  const tab: UserViewTab =
    route.kind === "chat"
      ? { kind: chat?.parent_chat_id != null ? "child_chat" : "chat", chat_id: route.chatId, title: chat?.title ?? "", project_id: pid }
      : route.kind === "memo"
        ? { kind: "memo", path: route.path, selected_text: clip(memoSelectionOf(route.projectId, route.path)), project_id: route.projectId }
        : route.kind === "file"
          ? editorTab(route.projectId, route.path, route.worktree ?? null, route.line)
          : route.kind === "changes"
            ? { kind: "changes", worktree: route.worktree ?? null, focus: route.focus ?? null, project_id: route.projectId }
            : route.kind === "database"
              ? databaseTab(route.projectId, `chat-${route.chatId}`)
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

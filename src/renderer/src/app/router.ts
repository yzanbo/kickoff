import { createContext, useContext, useState } from "react";
import { useWindowEvent } from "@/hooks/useWindowEvent";

// プロジェクトの設定は、タブではなくプロジェクト名の横の「編集」から開く。文書はエディタ（changes）でファイルとして見る
// （以前の要件定義書・スケジュール・タスク・レポートのタブの URL は、知らないタブとしてボードに戻る）
const PROJECT_TABS = ["board", "groups", "changes", "history"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

/** エディタタブで開くファイル（チャットの返答のファイルのチップから。worktree はワークツリーのフォルダ、なければ本体） */
export interface FileTarget {
  path: string;
  line?: number;
  worktree?: string;
}

export type Route =
  /** 全プロジェクト（全プロジェクトのチャットのカンバン。URL は #/） */
  | { name: "allProjects" }
  /**
   * group: グループのタブで、表示して目立たせるグループ（サイドバーのグループ名から来たとき）。
   * file: エディタタブで開くファイル（開いたら URL から外す）
   */
  | { name: "project"; id: number; tab: ProjectTab; group?: number; file?: FileTarget }
  | { name: "newChat"; projectId: number; group?: number }
  /** focus: 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  | { name: "chat"; projectId: number; chatId: number; focus?: number };

/** URL のハッシュを画面に読む（知らない形は全プロジェクト） */
export function parse(hash: string): Route {
  const [path, query = ""] = (hash.replace(/^#/, "") || "/").split("?");
  const params = new URLSearchParams(query);

  const chat = path.match(/^\/projects\/(\d+)\/chats\/(\d+)$/);
  if (chat) {
    const focus = Number(params.get("event"));
    return { name: "chat", projectId: Number(chat[1]), chatId: Number(chat[2]), ...(focus ? { focus } : {}) };
  }

  const newChat = path.match(/^\/projects\/(\d+)\/new$/);
  if (newChat) {
    // 以前の ?section= は読まない
    const group = Number(params.get("group"));
    return { name: "newChat", projectId: Number(newChat[1]), ...(Number.isInteger(group) && group > 0 ? { group } : {}) };
  }

  const project = path.match(/^\/projects\/(\d+)(?:\/([a-z]+))?$/);
  if (project) {
    const tab = (PROJECT_TABS as readonly string[]).includes(project[2] ?? "") ? (project[2] as ProjectTab) : "board";
    const group = Number(params.get("group"));
    const file = tab === "changes" ? parseFileTarget(params) : undefined;
    return {
      name: "project",
      id: Number(project[1]),
      tab,
      ...(tab === "groups" && Number.isInteger(group) && group > 0 ? { group } : {}),
      ...(file ? { file } : {}),
    };
  }
  return { name: "allProjects" };
}

/** エディタタブで開くファイル（?file=&line=&worktree=。file がなければ undefined） */
function parseFileTarget(params: URLSearchParams): FileTarget | undefined {
  const path = params.get("file");
  if (!path) return undefined;
  const line = Number(params.get("line"));
  const worktree = params.get("worktree");
  return { path, ...(Number.isInteger(line) && line > 0 ? { line } : {}), ...(worktree ? { worktree } : {}) };
}

function fileQuery({ path, line, worktree }: FileTarget): string {
  return `?${new URLSearchParams({ file: path, ...(line ? { line: String(line) } : {}), ...(worktree ? { worktree } : {}) })}`;
}

/**
 * ハッシュベースの簡易ルーター（Electron とスマホのブラウザの両方で動く）。
 * URL の購読は App の 1 回だけ（useHashRoute）で、部品は RouteContext から useRoute() で読む（route を props で中継しない）
 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useWindowEvent("hashchange", () => setRoute(parse(location.hash)));
  return route;
}

export const RouteContext = createContext<Route>({ name: "allProjects" });

/** いまの画面（App が入れた RouteContext） */
export const useRoute = () => useContext(RouteContext);

export function href(route: Route): string {
  switch (route.name) {
    case "project":
      if (route.tab === "board") return `#/projects/${route.id}`;
      if (route.tab === "changes") return `#/projects/${route.id}/changes${route.file ? fileQuery(route.file) : ""}`;
      return `#/projects/${route.id}/${route.tab}${route.group ? `?group=${route.group}` : ""}`;
    case "newChat": {
      return `#/projects/${route.projectId}/new${route.group ? `?group=${route.group}` : ""}`;
    }
    case "chat":
      return `#/projects/${route.projectId}/chats/${route.chatId}${route.focus ? `?event=${route.focus}` : ""}`;
    default:
      return "#/";
  }
}

export function navigate(route: Route, options: { replace?: boolean } = {}) {
  if (location.hash === href(route) && (route.name === "chat" || route.name === "newChat")) {
    window.dispatchEvent(new CustomEvent<ReopenRoute>(REOPEN_EVENT, { detail: route }));
    return;
  }
  if (options.replace) {
    // 履歴に残さず置き換える（新しいチャット画面 → 作成されたチャットへ移るとき）
    history.replaceState(null, "", href(route));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = href(route);
  }
}

/**
 * チャット・新しいチャットはプロジェクトのカンバンの右側のパネルで開く（単体の画面はない）。
 * 同じものを開き直したときは URL が変わらないので、このイベントでパネルに知らせる
 */
export const REOPEN_EVENT = "kickoff:reopen";
export type ReopenRoute = Extract<Route, { name: "chat" } | { name: "newChat" }>;

/**
 * チャット・新しいチャットの URL で出すプロジェクトのボード（どちらのボードも同じ右のパネルで開く）: サイドバーのグループの＋から来た新しいチャットは
 * グループのボード、ほかは最後に見たボードの列の分け方（columns。グループのボードで開いたチャットの URL でも、グループのボードのまま）
 */
export function boardTabOf(route: ReopenRoute, columns: "state" | "groups"): ProjectTab {
  if (route.name === "newChat" && route.group) return "groups";
  return columns === "groups" ? "groups" : "board";
}

/** チャットを開く（プロジェクトのボードへ移り、右側のパネルで開く） */
export function openChat(projectId: number, chatId: number, focus?: number, options: { replace?: boolean } = {}) {
  navigate({ name: "chat", projectId, chatId, ...(focus ? { focus } : {}) }, options);
}

/** 新しいチャットを始める（プロジェクトのボードへ移り、右側のパネルで始める） */
export function openNewChat(projectId: number, target: { group?: number } = {}) {
  navigate({ name: "newChat", projectId, ...target });
}

/** プロジェクトのエディタタブで、ファイルを開く（行があればその行へ移る） */
export function openProjectFile(projectId: number, file: FileTarget) {
  navigate({ name: "project", id: projectId, tab: "changes", file });
}

/** 画面がどのプロジェクトに属するか（サイドバーの強調表示や ⌘N 用） */
export function routeProjectId(route: Route): number | undefined {
  if (route.name === "project") return route.id;
  if (route.name === "newChat" || route.name === "chat") return route.projectId;
  return undefined;
}

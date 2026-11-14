import { createContext, useContext, useEffect, useState } from "react";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { readSetting, writeSetting } from "@/lib/storage";
import { LAST_ROUTE } from "@/lib/storageKeys";

// プロジェクトの設定は、タブではなくプロジェクト名の横の「編集」から開く。文書はファイルタブ（files）でファイルとして見る
// （以前の要件定義書・スケジュール・タスク・レポートのタブの URL は、知らないタブとしてボードに戻る）
// ファイル（files）・検索（search）・変更（changes = ソース管理）は、以前の「エディタ」タブの中の切り替えをタブにしたもの（開いたファイルは 3 つで共有）
// 以前のグループのボード（groups）の URL は、知らないタブとしてボードに戻る（列の分け方のボタンとグループのボードの画面はなくした）
const PROJECT_TABS = ["board", "chats", "files", "search", "changes", "history", "memos", "db", "github", "docker", "ci", "trash"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

/** ファイルタブで開くファイル（チャットの返答のファイルのチップから。worktree はワークツリーのフォルダ、なければ本体） */
export interface FileTarget {
  path: string;
  line?: number;
  worktree?: string;
}

export type Route =
  /** 全プロジェクト（全プロジェクトのチャットのカンバン。URL は #/） */
  | { name: "allProjects" }
  /**
   * file: ファイルタブで開くファイル（開いたら URL から外す）。memo: メモのタブで開くメモ（メモのフォルダからの相対パス。開いたら URL から外す）。
   * memoLine: そのメモで移る行（⌘K の「メモ内の文言」から。URL は ?line=）
   */
  | { name: "project"; id: number; tab: ProjectTab; file?: FileTarget; memo?: string; memoLine?: number }
  /** group・worktree: 始めるグループ・作業場所のワークツリーのフォルダ（チャットの右クリックの「新しいチャット」。同じグループ・作業場所で始める） */
  | { name: "newChat"; projectId: number; group?: number; worktree?: string }
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
    const worktree = params.get("worktree");
    return {
      name: "newChat",
      projectId: Number(newChat[1]),
      ...(Number.isInteger(group) && group > 0 ? { group } : {}),
      ...(worktree ? { worktree } : {}),
    };
  }

  const project = path.match(/^\/projects\/(\d+)(?:\/([a-z]+))?$/);
  if (project) {
    const named = (PROJECT_TABS as readonly string[]).includes(project[2] ?? "") ? (project[2] as ProjectTab) : "board";
    // 開くファイルはファイルタブでだけ読む（以前のファイルタブ changes?file= の URL も、ファイルタブで開く）
    const file = named === "files" || named === "changes" ? parseFileTarget(params) : undefined;
    const tab: ProjectTab = file ? "files" : named;
    const memo = tab === "memos" ? params.get("memo") : null;
    const memoLine = Number(params.get("line"));
    return {
      name: "project",
      id: Number(project[1]),
      tab,
      ...(file ? { file } : {}),
      ...(memo ? { memo } : {}),
      ...(memo && Number.isInteger(memoLine) && memoLine > 0 ? { memoLine } : {}),
    };
  }
  return { name: "allProjects" };
}

/** ファイルタブで開くファイル（?file=&line=&worktree=。file がなければ undefined） */
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
  // 最後に見ていた画面を覚える（次に起動したときに開く。restoreLastRoute）
  useEffect(() => writeSetting(LAST_ROUTE, href(lastingRoute(route))), [route]);
  return route;
}

/** 覚えておく形（開いたら URL から外す一度きりのもの: 開くファイル・メモ・強調する発言は外す） */
export function lastingRoute(route: Route): Route {
  if (route.name === "project") return { name: "project", id: route.id, tab: route.tab };
  if (route.name === "chat") return { name: "chat", projectId: route.projectId, chatId: route.chatId };
  return route;
}

/**
 * 起動したとき（ウィンドウを作り直したときも）、URL に画面の指定がなければ、最後に見ていた画面を開く（利用者の依頼。
 * 前は起動するといつも全プロジェクトだった）。App を描く前に呼ぶ。指定があれば（再読み込み・別ウィンドウ）そのまま
 */
export function restoreLastRoute() {
  if (location.hash.replace(/^#/, "") !== "") return;
  const last = readSetting(LAST_ROUTE);
  if (last) history.replaceState(null, "", last);
}

export const RouteContext = createContext<Route>({ name: "allProjects" });

/** いまの画面（App が入れた RouteContext） */
export const useRoute = () => useContext(RouteContext);

export function href(route: Route): string {
  switch (route.name) {
    case "project":
      if (route.tab === "board") return `#/projects/${route.id}`;
      if (route.tab === "files") return `#/projects/${route.id}/files${route.file ? fileQuery(route.file) : ""}`;
      if (route.tab === "memos")
        return `#/projects/${route.id}/memos${route.memo ? `?${new URLSearchParams({ memo: route.memo, ...(route.memoLine ? { line: String(route.memoLine) } : {}) })}` : ""}`;
      return `#/projects/${route.id}/${route.tab}`;
    case "newChat": {
      const query = new URLSearchParams({ ...(route.group ? { group: String(route.group) } : {}), ...(route.worktree ? { worktree: route.worktree } : {}) }).toString();
      return `#/projects/${route.projectId}/new${query ? `?${query}` : ""}`;
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

/** チャット・新しいチャットの URL で出すプロジェクトのタブ。チャットをボードと分けている（placement が separate）ときは「チャット」タブ、ほかはボード */
export function boardTabOf(placement: "separate" | "together"): ProjectTab {
  return placement === "separate" ? "chats" : "board";
}

/** チャットを開く（プロジェクトのボードへ移り、右側のパネルで開く） */
export function openChat(projectId: number, chatId: number, focus?: number, options: { replace?: boolean } = {}) {
  navigate({ name: "chat", projectId, chatId, ...(focus ? { focus } : {}) }, options);
}

/** 新しいチャットを始める（プロジェクトのボードへ移り、右側のパネルで始める。group・worktree: 始めるグループ・作業場所） */
export function openNewChat(projectId: number, target: { group?: number; worktree?: string } = {}) {
  navigate({ name: "newChat", projectId, ...target });
}

/** プロジェクトのファイルタブで、ファイルを開く（行があればその行へ移る） */
export function openProjectFile(projectId: number, file: FileTarget) {
  navigate({ name: "project", id: projectId, tab: "files", file });
}

/** プロジェクトの検索タブを開く（⌘⇧F） */
export function openProjectSearch(projectId: number) {
  navigate({ name: "project", id: projectId, tab: "search" });
}

/** メモのタブでそのメモを開く（path を省くとメモのタブへ移るだけ。開いているチャットは右のパネルに残る） */
export function openMemo(projectId: number, path?: string) {
  navigate({ name: "project", id: projectId, tab: "memos", ...(path ? { memo: path } : {}) });
}

/** 画面がどのプロジェクトに属するか（サイドバーの強調表示や ⌘N 用） */
export function routeProjectId(route: Route): number | undefined {
  if (route.name === "project") return route.id;
  if (route.name === "newChat" || route.name === "chat") return route.projectId;
  return undefined;
}

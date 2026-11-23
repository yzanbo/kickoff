import { createContext, useContext, useEffect, useState } from "react";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage as shellStorage } from "@/foundation/ui/storage/storage";
import { createSignal } from "@/foundation/ui/store";
import { definePoint } from "@/foundation/ui/points";

/** プロジェクトの画面（タブ）の ID。知っている ID は app/renderer/registry.ts が configureRouter で入れる */
export type ProjectViewId = string;

interface RouterConfig {
  projectViews: readonly ProjectViewId[];
  /** タブのない URL（#/projects/1）と、知らないタブで開く画面 */
  defaultView: ProjectViewId;
}
let config: RouterConfig | null = null;

/** 知っているプロジェクトの画面の ID を入れる（app/renderer/registry.ts が URL を読む前に 1 回。知らない tab は既定の画面） */
export function configureRouter(next: RouterConfig) {
  config = next;
}

function routerConfig(): RouterConfig {
  if (!config) throw new Error("ルーターの設定（configureRouter）の前に URL を読んだ");
  return config;
}

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
   * file: ファイルタブで開くファイル（開いたら URL から外す）。note: ノートのタブで開くノート（ノートのフォルダからの相対パス。開いたら URL から外す）。
   * noteLine: そのノートで移る行（⌘K の「ノート内の文言」から。URL は ?line=）
   */
  | { name: "project"; id: number; tab: ProjectViewId; file?: FileTarget; note?: string; noteLine?: number }
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
    const { projectViews, defaultView } = routerConfig();
    const named = projectViews.includes(project[2] ?? "") ? project[2]! : defaultView;
    // 開くファイルはファイルタブでだけ読む
    const file = named === "files" ? parseFileTarget(params) : undefined;
    const tab = file ? "files" : named;
    const note = tab === "notes" ? params.get("note") : null;
    const noteLine = Number(params.get("line"));
    return {
      name: "project",
      id: Number(project[1]),
      tab,
      ...(file ? { file } : {}),
      ...(note ? { note } : {}),
      ...(note && Number.isInteger(noteLine) && noteLine > 0 ? { noteLine } : {}),
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
export function useHashRoute(onChange?: (route: Route, replace: boolean) => void): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useWindowEvent("hashchange", (event) => {
    const next = parse(location.hash);
    const replace = Boolean((event as RouteChangeEvent).routeReplace);
    // 書きかけのある画面を離れるなら、聞いている間は URL を元に戻し、移ってよければ移り直す（確かめ済みの移動は聞き直さない）
    const asking = confirmedHash === href(next) ? null : askRouteLeave(route, next);
    confirmedHash = null;
    if (asking) {
      history.replaceState(null, "", href(route));
      void asking.then((ok) => ok && navigate(next, { replace, confirmed: true }));
      return;
    }
    // 画面を描くと、子の部品が URL を置き換えることがある。必ず描く前に元の移動を履歴へ積む
    onChange?.(next, replace);
    setRoute(next);
  });
  // 最後に見ていた画面を覚える（次に起動したときに開く。restoreLastRoute）
  useEffect(() => writeSetting(shellStorage.settings.lastRoute, href(lastingRoute(route))), [route]);
  return route;
}

/** 覚えておく形（開いたら URL から外す一度きりのもの: 開くファイル・ノート・強調する発言は外す） */
export function lastingRoute(route: Route): Route {
  if (route.name === "project") return { name: "project", id: route.id, tab: route.tab };
  if (route.name === "chat") return { name: "chat", projectId: route.projectId, chatId: route.chatId };
  return route;
}

/**
 * 起動したとき（ウィンドウを作り直したときも）、URL に画面の指定がなければ、最後に見ていた画面を開く。
 * App を描く前に呼ぶ。指定があれば（再読み込み・別ウィンドウ）そのまま
 */
export function restoreLastRoute() {
  if (location.hash.replace(/^#/, "") !== "") return;
  const last = readSetting(shellStorage.settings.lastRoute);
  if (last) history.replaceState(null, "", last);
}

export const RouteContext = createContext<Route>({ name: "allProjects" });

/** いまの画面（App が入れた RouteContext） */
export const useRoute = () => useContext(RouteContext);

export function href(route: Route): string {
  switch (route.name) {
    case "project":
      if (route.tab === routerConfig().defaultView) return `#/projects/${route.id}`;
      if (route.tab === "files") return `#/projects/${route.id}/files${route.file ? fileQuery(route.file) : ""}`;
      if (route.tab === "notes")
        return `#/projects/${route.id}/notes${route.note ? `?${new URLSearchParams({ note: route.note, ...(route.noteLine ? { line: String(route.noteLine) } : {}) })}` : ""}`;
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

/** アプリが URL を置き換えた通知（通常のリンク・ハッシュの変更と区別して、画面の履歴も置き換える） */
export interface RouteChangeEvent extends HashChangeEvent {
  routeReplace?: boolean;
}

/** 画面を移る前の確かめ（持ち主が ui/contributes.ts で登録する。聞くことがなければ null、あれば移ってよいか） */
export type RouteLeaveGuard = (from: Route, to: Route) => Promise<boolean> | null;
export const routeLeaveGuards = definePoint<RouteLeaveGuard>("routeLeaveGuards");

/** from から to へ移る前に聞くこと（初めに聞く確かめ。聞くことがなければ null） */
export function askRouteLeave(from: Route, to: Route): Promise<boolean> | null {
  for (const guard of routeLeaveGuards.items()) {
    const asking = guard(from, to);
    if (asking) return asking;
  }
  return null;
}

/** 移る前の確かめを済ませた移動（URL の購読が聞き直さない） */
let confirmedHash: string | null = null;

/** confirmed: 移る前の確かめを済ませた（戻る・進むが先に聞いた） */
export function navigate(route: Route, options: { replace?: boolean; confirmed?: boolean } = {}) {
  if (location.hash === href(route) && (route.name === "chat" || route.name === "newChat")) {
    reopened.emit(route);
    return;
  }
  if (options.confirmed) confirmedHash = href(route);
  if (options.replace) {
    // 履歴に残さず置き換える（新しいチャット画面 → 作成されたチャットへ移るとき）
    history.replaceState(null, "", href(route));
    const event: RouteChangeEvent = new HashChangeEvent("hashchange");
    event.routeReplace = true;
    window.dispatchEvent(event);
  } else {
    location.hash = href(route);
  }
}

export type ReopenRoute = Extract<Route, { name: "chat" } | { name: "newChat" }>;
/**
 * チャット・新しいチャットはプロジェクトのカンバンの右側のパネルで開く（単体の画面はない）。
 * 同じものを開き直したときは URL が変わらないので、この知らせでパネルに知らせる
 */
export const reopened = createSignal<ReopenRoute>();

/** 画面がどのプロジェクトに属するか（サイドバーの強調表示・⌘N・AI に見せる画面。全プロジェクトの画面なら null） */
export function routeProjectId(route: Route): number | null {
  if (route.name === "project") return route.id;
  if (route.name === "newChat" || route.name === "chat") return route.projectId;
  return null;
}

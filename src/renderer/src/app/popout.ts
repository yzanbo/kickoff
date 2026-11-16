// 別ウィンドウ（チャットの画面の右の欄の変更・ファイル・サブエージェント・子チャット・メモ・DB クライアント、左のサイドバー、
// 右端のチャット欄とそのブラウザ・ターミナルのタブを、メインのウィンドウの外に出して見る）の行き先
import type { TerminalTarget } from "@/features/panel/tabs/panelTypes";
import { postWindowMessage } from "./windowBus";

/** 別ウィンドウで開くもの（メモのほかは、開いたチャットに結びつく。chatId はメインのウィンドウのそのチャットへ知らせるのに使う） */
export type PopoutRoute =
  /** 作業場所のコミットしていない変更（focus のファイルの位置へ移る） */
  | { kind: "changes"; chatId: number; projectId: number; worktree?: string; focus?: string }
  /** 作業場所のファイルの中身（line を目立たせる） */
  | { kind: "file"; chatId: number; projectId: number; worktree?: string; path: string; line?: number }
  /** サブエージェントの画面（agentKey はサブエージェントの一覧の行のキー） */
  | { kind: "subagent"; chatId: number; agentKey: string }
  /** 子チャット（チャットの画面そのもの。chatId は子チャット） */
  | { kind: "chat"; chatId: number }
  /**
   * プロジェクトのメモ（path はメモのフォルダからの相対）。chatId は開いたチャット（メモをそのチャットの入力欄に添付する先。
   * チャットごとに別のウィンドウ）。メモのタブなど、チャットの外から開いたものはなし
   */
  | { kind: "memo"; projectId: number; path: string; chatId?: number }
  /** DB クライアント（右の欄の DB のタブ。worktree は SQLite のファイルを開く作業場所） */
  | { kind: "database"; chatId: number; projectId: number; worktree?: string }
  /** 左のサイドバー（アプリに 1 つ。行を押すと、メインのウィンドウで開く） */
  | { kind: "sidebar" }
  /** 右端のチャット欄（アプリに 1 つ。メインのウィンドウで開いているプロジェクトの欄を出す） */
  | { kind: "side" }
  /**
   * パネルのブラウザのタブ（panel は移す元の欄 = 戻す先。key はタブのキー。ページは url で開き直す）。
   * projectId はどのプロジェクトの欄か（AI の操作に使う。プロジェクトの欄でなければ null）
   */
  | { kind: "browser"; panel: string; key: string; url: string; title: string; projectId: number | null }
  /**
   * チャットのパネルのチャット（いちばん上の親）のタブ（panel は移す元の欄、key はタブのキー）。開いた別ウィンドウはタブの列を持ち、
   * ほかのチャットのタブもドラッグで足せる（features/popout/tabWindow.ts）
   */
  | { kind: "chats"; panel: string; key: string; chatId: number; projectId: number }
  /** パネルのターミナルのタブ（key は裏のシェルのキー。移した先で同じシェルにつなぎ直す） */
  | ({ kind: "terminal"; panel: string; key: string } & TerminalTarget);

const PREFIX = "/popout/";

/** 別ウィンドウの URL のハッシュ（"/popout/<種類>?…"。同じものは同じ文字になり、メインプロセスが同じウィンドウを前に出す） */
export function popoutPath(route: PopoutRoute): string {
  if (route.kind === "sidebar" || route.kind === "side") return `${PREFIX}${route.kind}`;
  const params = new URLSearchParams();
  if (route.kind === "browser") {
    params.set("panel", route.panel);
    params.set("key", route.key);
    if (route.projectId !== null) params.set("project", String(route.projectId));
    params.set("title", route.title);
    params.set("url", route.url);
    return `${PREFIX}${route.kind}?${params.toString()}`;
  }
  if (route.kind === "chats") {
    params.set("panel", route.panel);
    params.set("key", route.key);
    params.set("project", String(route.projectId));
    params.set("chat", String(route.chatId));
    return `${PREFIX}${route.kind}?${params.toString()}`;
  }
  if (route.kind === "terminal") {
    params.set("panel", route.panel);
    params.set("key", route.key);
    params.set("project", String(route.projectId));
    params.set("cwd", route.cwd);
    params.set("label", route.label);
    if (route.command) params.set("command", route.command);
    if (route.title) params.set("title", route.title);
    if (route.env) params.set("env", JSON.stringify(route.env));
    return `${PREFIX}${route.kind}?${params.toString()}`;
  }
  if (route.kind === "memo") {
    params.set("project", String(route.projectId));
    params.set("path", route.path);
    if (route.chatId !== undefined) params.set("chat", String(route.chatId));
    return `${PREFIX}${route.kind}?${params.toString()}`;
  }
  params.set("chat", String(route.chatId));
  if (route.kind === "subagent") params.set("agent", route.agentKey);
  else if (route.kind !== "chat") {
    params.set("project", String(route.projectId));
    if (route.worktree) params.set("worktree", route.worktree);
    if (route.kind === "file") {
      params.set("path", route.path);
      if (route.line) params.set("line", String(route.line));
    }
    // 移るファイルはいちばん後ろ（メインプロセスは、同じウィンドウかを focus を除いて見る）
    if (route.kind === "changes" && route.focus) params.set("focus", route.focus);
  }
  return `${PREFIX}${route.kind}?${params.toString()}`;
}

const positive = (value: string | null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/** 別ウィンドウの URL のハッシュを読む（別ウィンドウでなければ・読めなければ undefined） */
export function parsePopout(hash: string): PopoutRoute | undefined {
  const path = hash.replace(/^#/, "");
  if (!path.startsWith(PREFIX)) return undefined;
  const [kind, query = ""] = path.slice(PREFIX.length).split("?");
  const params = new URLSearchParams(query);
  if (kind === "sidebar" || kind === "side") return { kind };
  if (kind === "browser" || kind === "terminal") return parseTabPopout(kind, params);
  if (kind === "chats") {
    const panel = params.get("panel");
    const key = params.get("key");
    const projectId = positive(params.get("project"));
    const chatId = positive(params.get("chat"));
    return panel && key && projectId !== undefined && chatId !== undefined ? { kind, panel, key, chatId, projectId } : undefined;
  }
  if (kind === "memo") {
    const projectId = positive(params.get("project"));
    const memoPath = params.get("path");
    const chatId = positive(params.get("chat"));
    return projectId !== undefined && memoPath ? { kind, projectId, path: memoPath, ...(chatId !== undefined ? { chatId } : {}) } : undefined;
  }
  const chatId = positive(params.get("chat"));
  if (chatId === undefined) return undefined;
  if (kind === "subagent") {
    const agentKey = params.get("agent");
    return agentKey ? { kind, chatId, agentKey } : undefined;
  }
  if (kind === "chat") return { kind, chatId };
  const projectId = positive(params.get("project"));
  if (projectId === undefined) return undefined;
  const worktree = params.get("worktree") || undefined;
  const place = { chatId, projectId, ...(worktree ? { worktree } : {}) };
  if (kind === "changes") {
    const focus = params.get("focus") || undefined;
    return { kind, ...place, ...(focus ? { focus } : {}) };
  }
  if (kind === "database") return { kind, ...place };
  if (kind === "file") {
    const path = params.get("path");
    const line = positive(params.get("line"));
    return path ? { kind, ...place, path, ...(line ? { line } : {}) } : undefined;
  }
  return undefined;
}

/** パネルのブラウザ・ターミナルのタブの別ウィンドウの行き先を読む（欠けていれば undefined） */
function parseTabPopout(kind: "browser" | "terminal", params: URLSearchParams): PopoutRoute | undefined {
  const panel = params.get("panel");
  const key = params.get("key");
  if (!panel || !key) return undefined;
  const projectId = positive(params.get("project"));
  if (kind === "browser") {
    const url = params.get("url");
    return url === null ? undefined : { kind, panel, key, url, title: params.get("title") ?? "", projectId: projectId ?? null };
  }
  const cwd = params.get("cwd");
  const label = params.get("label");
  if (cwd === null || label === null || projectId === undefined) return undefined;
  const command = params.get("command");
  const title = params.get("title");
  const env = parseEnv(params.get("env"));
  return { kind, panel, key, cwd, label, projectId, ...(command ? { command } : {}), ...(title ? { title } : {}), ...(env ? { env } : {}) };
}

/** シェルに足す環境変数（JSON の文字の表。読めなければ undefined） */
function parseEnv(text: string | null): Record<string, string> | undefined {
  if (!text) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    return Object.values(value).every((v) => typeof v === "string") ? (value as Record<string, string>) : undefined;
  } catch {
    return undefined;
  }
}

/** 別ウィンドウを開けるか（Mac のアプリのときだけ） */
export const canPopout = (): boolean => Boolean(globalThis.window?.kickoff?.windows);

/** サイドバーの別ウィンドウの中か（下書き・パネルの状態はメインのウィンドウのものを写して読み、変えるのはメインに頼む） */
export const isSidebarWindow = (): boolean => globalThis.location !== undefined && parsePopout(location.hash)?.kind === "sidebar";

/** 同じ別ウィンドウかの見分け（変更の移るファイルを除いた URL のハッシュ） */
export const popoutKey = (route: PopoutRoute): string => popoutPath(route.kind === "changes" ? { ...route, focus: undefined } : route);

/**
 * 別ウィンドウで開く（同じものがもう開いていれば前に出す）。title はウィンドウの名前、at は新しく開くときに置く画面の位置（タブをウィンドウの外へドラッグして離した所）。
 * 変更の移るファイルは、新しく開くときは URL で、もう開いていたときは知らせ（popoutFocus）で渡す
 */
export function openPopout(route: PopoutRoute, title: string, at: { x: number; y: number } | null = null) {
  void window.kickoff?.windows.openPopout(popoutPath(route), title, at).then(() => {
    if (route.kind === "changes" && route.focus) postWindowMessage({ type: "popoutFocus", key: popoutKey(route), focus: route.focus });
  });
}

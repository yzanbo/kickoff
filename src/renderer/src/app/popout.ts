// 別ウィンドウ（チャットの画面の右の欄の変更・ファイル・サブエージェント・子チャット・メモ・DB クライアントを、メインのウィンドウの外に出して見る）の行き先
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
  | { kind: "database"; chatId: number; projectId: number; worktree?: string };

const PREFIX = "/popout/";

/** 別ウィンドウの URL のハッシュ（"/popout/<種類>?…"。同じものは同じ文字になり、メインプロセスが同じウィンドウを前に出す） */
export function popoutPath(route: PopoutRoute): string {
  const params = new URLSearchParams();
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

/** 別ウィンドウを開けるか（Mac のアプリのときだけ） */
export const canPopout = (): boolean => Boolean(globalThis.window?.kickoff?.windows);

/** 同じ別ウィンドウかの見分け（変更の移るファイルを除いた URL のハッシュ） */
export const popoutKey = (route: PopoutRoute): string => popoutPath(route.kind === "changes" ? { ...route, focus: undefined } : route);

/**
 * 別ウィンドウで開く（同じものがもう開いていれば前に出す）。title はウィンドウの名前。
 * 変更の移るファイルは、新しく開くときは URL で、もう開いていたときは知らせ（popoutFocus）で渡す
 */
export function openPopout(route: PopoutRoute, title: string) {
  void window.kickoff?.windows.openPopout(popoutPath(route), title).then(() => {
    if (route.kind === "changes" && route.focus) postWindowMessage({ type: "popoutFocus", key: popoutKey(route), focus: route.focus });
  });
}

// タブの中身を作る関数（種類ごとのキーの決め方）。種類の決まり（アイコン・名前・中身）は tabKinds.ts、型は panelTypes.ts
import { normalizeUrl } from "@/foundation/ui/lib/url";
import type { NewChatTarget, PanelTab, ProjectTool, ProjectView, TerminalTarget } from "./panelTypes";
import type { TabPatch } from "@/features/panel/ui/state/panelState";

type TabKind = PanelTab["kind"];
type TabOf<K extends TabKind> = Extract<PanelTab, { kind: K }>;

/** 新しいタブ・ペインのキー（"<頭>:<時刻>:<乱数>"。ターミナルのキーは裏のシェルのキーにも使うので、同じ瞬間に 2 つ作っても重ならないよう乱数を添える） */
export const newTabKey = (prefix: "new" | "newChild" | "browser" | "terminal" | "pane") => `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

/** チャットのタブのキー（同じチャットは 1 つのタブ。サイドバーとの連動・カードの選択中もこれで引く） */
export const chatKey = (id: number) => `chat:${id}`;

/** チャットのタブ（focus: 検索結果から開いたときに、スクロールして強調する発言） */
export const chatTab = (chat: { id: number; project_id: number; title?: string }, focus?: number): TabOf<"chat"> => ({
  key: chatKey(chat.id),
  kind: "chat",
  id: chat.id,
  projectId: chat.project_id,
  title: chat.title,
  ...(focus ? { focus } : {}),
});

/** 新しいチャットのタブ（押すたびに新しいキー。seed は初めに入力欄に入れるもの（送信待ちの指示から始めたとき）） */
export const newChatTab = (target: NewChatTarget, seed?: TabOf<"new">["seed"], key = newTabKey("new")): TabOf<"new"> => ({
  key,
  kind: "new",
  ...target,
  ...(seed ? { seed, draftText: seed.text } : {}),
});

/** サブエージェントのタブのキー（同じサブエージェントは、その欄に 1 つのタブ） */
export const agentTabKey = (agentKey: string) => `agent:${agentKey}`;

/** サブエージェントの画面のタブ（チャットの画面の右の欄に開く。agentKey は一覧の行のキー。path は入れ子のときの外側からの道筋） */
export const subagentTab = ({ chatId, agentKey, title, path }: { chatId: number; agentKey: string; title: string; path?: string }): TabOf<"subagent"> => ({
  key: agentTabKey(agentKey),
  kind: "subagent",
  chatId,
  agentKey,
  title,
  ...(path ? { path } : {}),
});

/** 変更のタブのキー（作業場所ごとに、その欄に 1 つのタブ） */
const changesTabKey = (worktree: string | undefined) => `changes:${worktree ?? ""}`;

/** 右の欄に開く変更のタブ（作業場所のコミットしていない変更。focus は移るファイル） */
export const changesTab = ({ chatId, projectId, worktree, focus }: { chatId: number; projectId: number; worktree?: string; focus?: string }): TabOf<"changes"> => ({
  key: changesTabKey(worktree),
  kind: "changes",
  chatId,
  projectId,
  ...(worktree ? { worktree } : {}),
  ...(focus ? { focus, focusAt: Date.now() } : {}),
});

/** プロジェクトの画面（ファイル・検索・履歴）のタブのキー（種類ごとに、その欄に 1 つのタブ） */
const projectViewTabKey = (view: ProjectView) => `project-view:${view}`;

/** 右の欄に開く、プロジェクトの「ファイル」「検索」「履歴」タブと同じ画面のタブ */
export const projectViewTab = ({ chatId, projectId, worktree, view }: Omit<TabOf<"projectView">, "key" | "kind">): TabOf<"projectView"> => ({
  key: projectViewTabKey(view),
  kind: "projectView",
  chatId,
  projectId,
  view,
  ...(worktree ? { worktree } : {}),
});

/** ファイルのタブのキー（同じ作業場所の同じファイルは、その欄に 1 つのタブ） */
const fileTabKey = (worktree: string | undefined, path: string) => `file:${worktree ?? ""}:${path}`;

/** 右の欄に開くファイルのタブ（作業場所のファイルの中身。line は目立たせる行） */
export const fileTab = ({ chatId, projectId, worktree, path, line }: Omit<TabOf<"file">, "key" | "kind">): TabOf<"file"> => ({
  key: fileTabKey(worktree, path),
  kind: "file",
  chatId,
  projectId,
  path,
  ...(worktree ? { worktree } : {}),
  ...(line ? { line } : {}),
});

/** ノートのタブのキー（同じノートは、その欄に 1 つのタブ） */
export const noteTabKey = (projectId: number, path: string) => `note:${projectId}:${path}`;

/** 右の欄に開くノートのタブ */
export const noteTab = ({ chatId, projectId, path }: Omit<TabOf<"note">, "key" | "kind">): TabOf<"note"> => ({
  key: noteTabKey(projectId, path),
  kind: "note",
  chatId,
  projectId,
  path,
});

/** 右の欄に開く DB クライアントのタブ（その欄に 1 つ） */
export const databaseTab = ({ chatId, projectId, worktree }: Omit<TabOf<"database">, "key" | "kind">): TabOf<"database"> => ({
  key: "database",
  kind: "database",
  chatId,
  projectId,
  ...(worktree ? { worktree } : {}),
});

/** 右の欄に開く GitHub のタブ（その欄に 1 つ） */
export const githubTab = ({ chatId, projectId }: Omit<TabOf<"github">, "key" | "kind">): TabOf<"github"> => ({ key: "github", kind: "github", chatId, projectId });

/** 右の欄に開く CI・Docker・ゴミ箱のタブ（種類ごとに、その欄に 1 つ） */
export const projectToolTab = <K extends ProjectTool>(kind: K, { chatId, projectId }: { chatId: number; projectId: number }) =>
  ({ key: kind, kind, chatId, projectId }) as TabOf<K>;

/** 子チャットのタブのキー（同じ子チャットは、その欄に 1 つのタブ） */
const childTabKey = (childId: number) => `child:${childId}`;

/** 右の欄に開く子チャットのタブ */
export const childTab = ({ chatId, childId, projectId, title }: Omit<TabOf<"child">, "key" | "kind">): TabOf<"child"> => ({
  key: childTabKey(childId),
  kind: "child",
  chatId,
  childId,
  projectId,
  title,
});

/** 新しい子チャットのタブ（押すたびに新しいキー。最初の文を送ると childTab に置き換える。中身の意味は PanelTab の newChild） */
export const newChildTab = (target: Omit<TabOf<"newChild">, "key" | "kind">): TabOf<"newChild"> => ({ key: newTabKey("newChild"), kind: "newChild", ...target });

/** ブラウザのタブ（url がなければ空のページで、アドレス欄に入力して開く。押すたびに新しいキー） */
export const browserTab = (url = ""): TabOf<"browser"> => ({ key: newTabKey("browser"), kind: "browser", url, title: "" });

/** ターミナルのタブ（開く場所のフォルダでシェルを始める。どのプロジェクトの作業場所かも覚える） */
export const terminalTab = (target: TerminalTarget): TabOf<"terminal"> => ({ key: newTabKey("terminal"), kind: "terminal", ...target });

/** ターミナルのタブの名前（タブの列と、AI が読むタブの一覧で同じ） */
export const terminalTitle = (t: TerminalTarget) => t.title ?? `ターミナル · ${t.label}`;

/** ブラウザのタブに出すホスト名（URL として読めなければそのまま） */
export function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).host || url;
  } catch {
    return url;
  }
}

/**
 * もう開いていたときに変える中身（openTab の reopen）: チャットは強調する発言（検索結果から開いたとき）、変更は移るファイル（押し直しても移るよう頼んだ時刻も）、
 * ファイルは目立たせる行。ほかの種類は開いていたタブをそのまま表示する
 */
export function reopenOf(tab: PanelTab): TabPatch | undefined {
  if (tab.kind === "chat") return tab.focus ? { kind: "chat", fields: { focus: tab.focus } } : undefined;
  if (tab.kind === "changes") return tab.focus ? { kind: "changes", fields: { focus: tab.focus, focusAt: tab.focusAt } } : undefined;
  if (tab.kind === "file") return { kind: "file", fields: { line: tab.line } };
  return undefined;
}

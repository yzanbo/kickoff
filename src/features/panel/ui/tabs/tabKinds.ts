import { Bot, Container, Database, FileDiff, FileText, GitPullRequest, Globe, MessageSquare, MessageSquarePlus, MessagesSquare, SquarePen, SquareTerminal, StickyNote, Trash2, Workflow, type LucideIcon } from "lucide-react";
import { NEW_CHAT_TITLE, chatTitle } from "@/features/chat/ui/chatTitle";
import { draftDisplayTitle } from "@/features/composer/ui/drafts/draftTitle";
import { api } from "@/foundation/ui/api";
import { baseName } from "@/foundation/ui/lib/format";
import { ChildTabBadge } from "@/features/childChats/ui/ChildTabBadge";
import { FileTabLead } from "@/features/files/ui/FileTabLead";
import { ProjectViewTabLead } from "@/features/projects/ui/views/ProjectViewTabLead";
import { BrowserTabLead } from "@/features/browser/ui/BrowserTabLead";
import { projectOfPanel } from "@/features/panel/ui/surfaces";
import { defineTabKind, type AnyTabKind } from "@/features/panel/ui/kind";
import { PROJECT_VIEW_LABELS, type PanelTab, type ProjectTool } from "./panelTypes";
import { hostOf, terminalTitle } from "./tabData";
import {
  BrowserPage,
  ChangesPage,
  ChatTabPage,
  ChildPage,
  CiPage,
  DatabasePage,
  DockerPage,
  FilePage,
  GitHubPage,
  NewChatPage,
  NewChildPage,
  NotePage,
  ProjectFilePage,
  ProjectViewPage,
  SubagentPage,
  TerminalPage,
  TrashPage,
} from "./PanelTabPage";

/**
 * パネルのタブの種類（panelTypes.ts の `PanelTab` の kind）ごとの決まり（defineTabKind の項目）。
 * アイコンと名前・どのプロジェクトのものか・中身を作る時・閉じたときの後始末・別ウィンドウの行き先・中身の部品を、種類で分岐させずにここから引く。
 * タブを作る関数（キーの決め方）は tabData.ts
 */

type TabOf<K extends PanelTab["kind"]> = Extract<PanelTab, { kind: K }>;
type ToolTab = TabOf<"github" | ProjectTool>;

/** 右の欄に欄に 1 つだけ開く、プロジェクトのタブと同じ画面（GitHub・CI・Docker・ゴミ箱）の種類の決まり。違うのはアイコンと名前だけ */
function projectToolKind(id: ToolTab["kind"], icon: LucideIcon, label: string, hint: string, Page: AnyTabKind["Page"]): AnyTabKind {
  return defineTabKind<ToolTab>({
    id,
    icon,
    label: () => label,
    hint: () => hint,
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    ownerChatId: (t) => t.chatId,
    Page,
  });
}

/** いまの 17 種類（持ち主の機能へ移すまで panel に置く。ui/contributes.ts が panelTabs に入れる。中身の部品は PanelTabPage.tsx） */
export const PANEL_TAB_KINDS: readonly AnyTabKind[] = [
  defineTabKind<TabOf<"chat">>({
    id: "chat",
    icon: MessageSquare,
    iconClass: "muted",
    // サイドバーの一覧にあればその最新の名前、なければタブが覚えている名前（アーカイブ済み・絞り込みで外れたチャットなど）
    label: (t, chat) => {
      const title = chat?.title ?? t.title;
      return title === undefined ? "チャット" : chatTitle(title);
    },
    group: (t, chat, groupOf) => groupOf(t.projectId, chat?.group_id),
    projectOf: (t) => t.projectId,
    ownerChatId: (t) => t.id,
    createWhen: "shown",
    // チャット（いちばん上の親）をタブの列のある別ウィンドウへ移す（features/popout/tabWindow.ts）
    popout: (t, panel) => ({
      route: { kind: "chats", panel, key: t.key, chatId: t.id, projectId: t.projectId },
      title: `${t.chat?.title ?? t.title ?? "チャット"} — チャット`,
    }),
    Page: ChatTabPage,
  }),
  defineTabKind<TabOf<"new">>({
    id: "new",
    icon: SquarePen,
    // 表示だけ本文の冒頭にする（手動の名前があれば優先）
    label: (t) => draftDisplayTitle(t.title, t.draftText),
    // 作成先のグループ名（パネルの中で分かりしだい入れる。送ったあとのチャットのタブも同じく添える）
    group: (t, _chat, groupOf) => groupOf(t.projectId, t.group) ?? (t.groupName ? { name: t.groupName, hue: null } : undefined),
    projectOf: (t) => t.projectId,
    // チャットの別ウィンドウへ移す（書きかけの文・添付ごと。中身は popOutTab が tabHandoff で渡す）
    popout: (t, panel) => ({ route: { kind: "chats", panel, key: t.key, projectId: t.projectId }, title: `${t.title ?? NEW_CHAT_TITLE} — チャット` }),
    Page: NewChatPage,
  }),
  defineTabKind<TabOf<"subagent">>({
    id: "subagent",
    icon: Bot,
    badge: "サブ",
    // サブエージェントの中で起動したもの（入れ子）は「↳」を付け、乗せると外側からの道筋（「調査 › 洗い出し」）
    label: (t) => (t.path ? `↳ ${t.title}` : t.title),
    hint: (t) => t.path ?? t.title,
    projectOf: () => undefined,
    // そのチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    ownerChatId: (t) => t.chatId,
    popout: (t) => ({ route: { kind: "subagent", chatId: t.chatId, agentKey: t.agentKey }, title: `${t.title} — サブエージェント` }),
    Page: SubagentPage,
  }),
  defineTabKind<TabOf<"changes">>({
    id: "changes",
    icon: FileDiff,
    label: () => "変更",
    hint: (t) => `コミットしていない変更（${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}）`,
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    ownerChatId: (t) => t.chatId,
    popout: (t) => ({
      route: { kind: "changes", chatId: t.chatId, projectId: t.projectId, ...(t.worktree ? { worktree: t.worktree } : {}) },
      title: `変更 — ${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}`,
    }),
    Page: ChangesPage,
  }),
  defineTabKind<TabOf<"projectView">>({
    id: "projectView",
    icon: FileText,
    // アイコンはプロジェクトの左の列のタブと同じ
    Lead: ProjectViewTabLead,
    label: (t) => PROJECT_VIEW_LABELS[t.view],
    hint: (t) => `プロジェクトの「${PROJECT_VIEW_LABELS[t.view]}」（${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}から）`,
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    ownerChatId: (t) => t.chatId,
    Page: ProjectViewPage,
  }),
  defineTabKind<TabOf<"file">>({
    id: "file",
    icon: FileText,
    // アイコンはエディタと同じファイルの種類のアイコン
    Lead: FileTabLead,
    label: (t) => baseName(t.path),
    hint: (t) => (t.line ? `${t.path}（${t.line} 行目）` : t.path),
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    ownerChatId: (t) => t.chatId,
    popout: (t) => ({
      route: { kind: "file", chatId: t.chatId, projectId: t.projectId, path: t.path, ...(t.worktree ? { worktree: t.worktree } : {}), ...(t.line ? { line: t.line } : {}) },
      title: t.path,
    }),
    Page: FilePage,
  }),
  defineTabKind<TabOf<"projectFile">>({
    id: "projectFile",
    icon: FileText,
    Lead: FileTabLead,
    // 差分のタブは、同じファイルの中身のタブと見分ける（VS Code の「(Working Tree)」「(Index)」と同じ）
    label: (t) => `${baseName(t.path)}${t.staged === undefined || t.line !== undefined ? "" : t.staged ? "（ステージ済み）" : "（変更）"}`,
    hint: (t) => (t.line ? `${t.path}（${t.line} 行目）` : t.path),
    projectOf: (t) => t.projectId,
    // 見ていないタブのファイルまで読み込まない
    createWhen: "shown",
    Page: ProjectFilePage,
  }),
  defineTabKind<TabOf<"note">>({
    id: "note",
    icon: StickyNote,
    badge: "ノート",
    label: (t) => baseName(t.path),
    hint: (t) => `ノート: ${t.path}`,
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）。ノートのタブの右（notes）で開いたものはチャットなし
    ownerChatId: (t) => t.chatId,
    popout: (t) => ({ route: { kind: "note", projectId: t.projectId, path: t.path, ...(t.chatId !== null ? { chatId: t.chatId } : {}) }, title: `${baseName(t.path)} — ノート` }),
    Page: NotePage,
  }),
  defineTabKind<TabOf<"database">>({
    id: "database",
    icon: Database,
    label: () => "DB",
    hint: (t) => `DB クライアント（SQLite は${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}のファイル）`,
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    ownerChatId: (t) => t.chatId,
    popout: (t) => ({
      route: { kind: "database", chatId: t.chatId, projectId: t.projectId, ...(t.worktree ? { worktree: t.worktree } : {}) },
      title: `DB — ${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}`,
    }),
    Page: DatabasePage,
  }),
  projectToolKind("github", GitPullRequest, "GitHub", "GitHub（このプロジェクトの連携先の issue・PR）", GitHubPage),
  projectToolKind("ci", Workflow, "CI", "CI の結果（このプロジェクトの GitHub Actions の実行）", CiPage),
  projectToolKind("docker", Container, "Docker", "Docker（このプロジェクトの compose のサービス）", DockerPage),
  projectToolKind("trash", Trash2, "ゴミ箱", "ゴミ箱（3 日で消えます）", TrashPage),
  defineTabKind<TabOf<"child">>({
    id: "child",
    icon: MessagesSquare,
    // 子チャットであることは札で見せる（名前の頭の「↳」だけだと、サブエージェントの入れ子と見分けにくい）
    badge: "子",
    // 孫より深いものは「孫」「ひ孫」にし、札と下線を深さの色にする（孫・ひ孫も同じ欄に子と並ぶので見分ける）
    BadgeText: ChildTabBadge,
    label: (t) => chatTitle(t.title),
    hint: (t) => `子チャット: ${chatTitle(t.title)}`,
    projectOf: (t) => t.projectId,
    // 子チャットを消したら閉じる（親を消すと子孫も消える）
    ownerChatId: (t) => t.childId,
    popout: (t) => ({ route: { kind: "chat", chatId: t.childId }, title: `${chatTitle(t.title)} — 子チャット` }),
    Page: ChildPage,
  }),
  defineTabKind<TabOf<"newChild">>({
    id: "newChild",
    icon: MessageSquarePlus,
    badge: "子",
    label: () => "新しい子チャット",
    hint: () => "新しい子チャット（このチャットの会話を引き継ぎ、最初の文を送ると始まります）",
    projectOf: (t) => t.projectId,
    // 親のチャットを消したら閉じる（孫を作るタブは、その親）
    ownerChatId: (t) => t.parentId ?? t.chatId,
    Page: NewChildPage,
  }),
  defineTabKind<TabOf<"browser">>({
    id: "browser",
    icon: Globe,
    // AI が操作している間は「AI 操作中」の印
    Lead: BrowserTabLead,
    // 空のページのあいだは「新しいタブ」
    label: (t) => t.title || (t.url ? hostOf(t.url) : "新しいタブ"),
    hint: (t) => t.url,
    projectOf: () => undefined,
    // いまのページを別ウィンドウで開き直す（webview はウィンドウをまたげないので、戻る・進むの履歴は引き継がない）
    popout: (t, panel) => ({
      route: { kind: "browser", panel, key: t.key, url: t.current ?? t.url, title: t.title, projectId: projectOfPanel(panel) },
      title: `${t.title || (t.url ? hostOf(t.url) : "新しいタブ")} — ブラウザ`,
    }),
    Page: BrowserPage,
  }),
  defineTabKind<TabOf<"terminal">>({
    id: "terminal",
    icon: SquareTerminal,
    label: terminalTitle,
    hint: (t) => (t.command ? `${t.command}\n${t.cwd}` : t.cwd),
    projectOf: (t) => t.projectId,
    // シェルを止める（コアの API。もう終わっていれば 404 なので、失敗は捨てる）
    dispose: (t) => void (globalThis.window?.kickoff?.terminal && api.closeTerminal(t.key).catch(() => {})),
    // 同じシェルに別ウィンドウからつなぎ直す（移すときはシェルを止めない。popOutTab の keep）
    popout: (t, panel) => {
      const { key, kind: _kind, ...target } = t;
      return { route: { kind: "terminal", panel, key, ...target }, title: `${terminalTitle(t)} — ターミナル` };
    },
    Page: TerminalPage,
  }),
];

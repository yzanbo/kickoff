import { Bot, FileDiff, FileText, Globe, MessageSquare, MessageSquarePlus, MessagesSquare, SquarePen, SquareTerminal, StickyNote, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { Chat } from "@shared/types";
import { NEW_CHAT_TITLE, chatTitle } from "@/features/chat/chatTitle";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import type { BucketHead } from "@/features/chatList/buckets";
import { baseName } from "@/lib/format";
import { normalizeUrl } from "@/lib/url";
import { ChildTabBadge } from "@/features/chat/children/ChildTabBadge";
import { FileTabLead } from "@/features/editor/FileTabLead";
import { ProjectViewTabLead } from "./ProjectViewTabLead";
import { OTHER_CLUSTER } from "@/features/panel/clusters/tabClusters";
import type { PanelKind } from "@/features/panel/state/panelKinds";
import type { PopoutRoute } from "@/app/popout";
import { PROJECT_VIEW_LABELS, type NewChatTarget, type PanelTab, type ProjectView, type TerminalTarget } from "./panelTypes";

/**
 * パネルのタブの種類（チャット・新しいチャット（下書き）・サブエージェント・変更・プロジェクトの画面（ファイル・検索・履歴）・ファイル・メモ・子チャット・新しい子チャット・ブラウザ・ターミナル）ごとの違いを集めた表。
 * タブを作る（キーの決め方）・欄の「表示するタブ」のどれに入るか・アイコンと名前・どのプロジェクトのものか・中身を作る時・閉じたときの後始末・
 * どのまとまりに入るかを、種類で分岐させずにここから引く。中身（どの部品を描き、中身からの知らせでタブをどう変えるか）は PanelTabPage の PAGES
 */

type TabKind = PanelTab["kind"];
type TabOf<K extends TabKind> = Extract<PanelTab, { kind: K }>;

/** 新しいタブ・ペインのキー（"<頭>:<時刻>:<乱数>"。ターミナルのキーは裏のシェルのキーにも使うので、同じ瞬間に 2 つ作っても重ならないよう乱数を添える） */
export const newTabKey = (prefix: "new" | "newChild" | "browser" | "terminal" | "pane") => `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

/** チャットのタブのキー（同じチャットは 1 つのタブ。サイドバーとの連動・カードの選択中もこれで引く） */
export const chatKey = (id: number) => `chat:${id}`;

/** チャットのタブ（focus: 検索結果から開いたときに、スクロールして強調する発言） */
export const chatTab = (chat: Pick<Chat, "id" | "project_id"> & Partial<Pick<Chat, "title">>, focus?: number): TabOf<"chat"> => ({
  key: chatKey(chat.id),
  kind: "chat",
  id: chat.id,
  projectId: chat.project_id,
  title: chat.title,
  ...(focus ? { focus } : {}),
});

/** 新しいチャットのタブ（押すたびに新しいキー。seed は初めに入力欄に入れるもの（送信待ちの指示から始めたとき）） */
export const newChatTab = (target: NewChatTarget, seed?: NewChatSeed, key = newTabKey("new")): TabOf<"new"> => ({
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
export const changesTabKey = (worktree: string | undefined) => `changes:${worktree ?? ""}`;

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
export const projectViewTabKey = (view: ProjectView) => `project-view:${view}`;

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
export const fileTabKey = (worktree: string | undefined, path: string) => `file:${worktree ?? ""}:${path}`;

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

/** メモのタブのキー（同じメモは、その欄に 1 つのタブ） */
export const memoTabKey = (projectId: number, path: string) => `memo:${projectId}:${path}`;

/** 右の欄に開くメモのタブ */
export const memoTab = ({ chatId, projectId, path }: Omit<TabOf<"memo">, "key" | "kind">): TabOf<"memo"> => ({
  key: memoTabKey(projectId, path),
  kind: "memo",
  chatId,
  projectId,
  path,
});

/** 子チャットのタブのキー（同じ子チャットは、その欄に 1 つのタブ） */
export const childTabKey = (childId: number) => `child:${childId}`;

/** 右の欄に開く子チャットのタブ */
export const childTab = ({ chatId, childId, projectId, title }: Omit<TabOf<"child">, "key" | "kind">): TabOf<"child"> => ({
  key: childTabKey(childId),
  kind: "child",
  chatId,
  childId,
  projectId,
  title,
});

/** 右の欄の「＋」で開く、新しい子チャットのタブ（押すたびに新しいキー。最初の文を送ると childTab に置き換える） */
export const newChildTab = ({ chatId, projectId }: { chatId: number; projectId: number }): TabOf<"newChild"> => ({
  key: newTabKey("newChild"),
  kind: "newChild",
  chatId,
  projectId,
});

/** ブラウザのタブ（url がなければ空のページで、アドレス欄に入力して開く。押すたびに新しいキー） */
export const browserTab = (url = ""): TabOf<"browser"> => ({ key: newTabKey("browser"), kind: "browser", url, title: "" });

/** ターミナルのタブ（開く場所のフォルダでシェルを始める。どのプロジェクトの作業場所かも覚える） */
export const terminalTab = ({ cwd, label, projectId }: TerminalTarget): TabOf<"terminal"> => ({ key: newTabKey("terminal"), kind: "terminal", cwd, label, projectId });

/** ブラウザのタブに出すホスト名（URL として読めなければそのまま） */
export function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).host || url;
  } catch {
    return url;
  }
}

/** タブのまとまりを決めるのに使うもの（useTabClusters が、いまのまとめ方・サイドバーのチャット・ワークツリーの一覧から作る） */
export interface ClusterResolver {
  /** ID のチャット（サイドバーの一覧から。なければ undefined） */
  chatById: (id: number) => Chat | undefined;
  /** チャットが入るまとまり（サイドバー・ボードと同じ決め方） */
  ofChat: (chat: Chat) => BucketHead;
  /** 作成先（プロジェクト・グループ）のまとまり（チャットがまだ分からないタブ・新しいチャット） */
  ofTarget: (projectId: number, group?: number, worktree?: string) => BucketHead;
  /** フォルダ（本体・ワークツリー）のまとまり（ターミナル。グループ別では「その他」） */
  ofFolder: (projectId: number, cwd: string) => BucketHead;
}

/** タブの名前の後ろに添えるグループ（名前と色。色は分からないとき null） */
export interface TabGroupBadge {
  name: string;
  hue: number | null;
}

/** プロジェクトのグループを引く（なければ undefined） */
export type TabGroupLookup = (projectId: number, groupId: number | null | undefined) => TabGroupBadge | undefined;

interface TabKindSpec<T extends PanelTab> {
  /** 欄の「表示するタブ」でどの種類に入るか（新しいチャットはチャット） */
  shows: PanelKind;
  /** タブのアイコン（チャットのタブは、状態の印に置き換わる） */
  icon: LucideIcon;
  iconClass?: string;
  /**
   * 名前の前に置く種類の札（チャットの画面の右の欄に並ぶメモ・サブエージェント・子チャットを、タブを見ただけで見分ける）。札があるタブは、
   * 上の 1px の線と表示中の枠も同じ形で、色だけ種類ごとに変える（CSS の panel/side-panel-tab-kinds.css）
   */
  badge?: string;
  /** 札の文をタブごとに変えるときの部品（子チャットの深さ「子 / 孫 / ひ孫」。なければ badge の文） */
  BadgeText?: ComponentType<{ tab: T }>;
  /** アイコンの代わりに名前の前に置く部品（サブエージェントのタブの状態のアイコン。チャットのタブの状態の印は PaneTab が出す） */
  Lead?: ComponentType<{ tab: T }>;
  /** タブに出す名前（chat はタブのチャット（サイドバーの一覧にあれば最新のもの）） */
  label: (tab: T, chat: Chat | undefined) => string;
  /** マウスを乗せたときの説明（なければ名前とグループ名） */
  hint?: (tab: T) => string;
  /** 名前の後ろに控えめに添えるグループ名（nameOf はプロジェクトのグループ名を引く） */
  group?: (tab: T, chat: Chat | undefined, groupOf: TabGroupLookup) => TabGroupBadge | undefined;
  /** どのプロジェクトのタブか（まとまり・グループ名を引くのに使う。ブラウザはどれにも入らない） */
  projectOf: (tab: T) => number | undefined;
  /** どのチャットのタブか（そのチャットを消したら閉じる。チャット・サブエージェント） */
  chatIdOf?: (tab: T) => number | null;
  /** 中身を初めて表示したときに作るか（チャットのタブはサイドバーと連動して自動で増えるので、見ていないチャットまで読み込まない） */
  lazy?: boolean;
  /** 閉じたときの後始末（ターミナルはシェルも止める。ブラウザの開発者ツールは webview がなくなるときに BrowserPane が閉じる） */
  dispose?: (tab: T) => void;
  /** どのまとまりに入るか（グループ別・作業場所別にまとめるとき） */
  cluster: (tab: T, resolve: ClusterResolver) => BucketHead;
  /** 別ウィンドウで開けるタブ（チャットの画面の右の欄のサブエージェント・変更・ファイル・メモ・子チャット）の行き先とウィンドウの名前 */
  popout?: (tab: T) => { route: PopoutRoute; title: string };
}

export const TAB_KINDS: { [K in TabKind]: TabKindSpec<TabOf<K>> } = {
  chat: {
    shows: "chat",
    icon: MessageSquare,
    iconClass: "muted",
    // サイドバーの一覧にあればその最新の名前、なければタブが覚えている名前（アーカイブ済み・絞り込みで外れたチャットなど）
    label: (t, chat) => {
      const title = chat?.title ?? t.title;
      return title === undefined ? "チャット" : chatTitle(title);
    },
    group: (t, chat, groupOf) => groupOf(t.projectId, chat?.group_id),
    projectOf: (t) => t.projectId,
    chatIdOf: (t) => t.id,
    lazy: true,
    // チャットが分からない（まだ届いていない）タブは、作成先（グループなし・本体）のまとまり
    cluster: (t, r) => {
      const chat = r.chatById(t.id) ?? t.chat;
      return chat ? r.ofChat(chat) : r.ofTarget(t.projectId);
    },
  },
  new: {
    shows: "chat",
    icon: SquarePen,
    // 送る前に名前を付けていればその名前（右クリックの「名前を変更」）
    label: (t) => t.title ?? NEW_CHAT_TITLE,
    // 作成先のグループ名（パネルの中で分かりしだい入れる。送ったあとのチャットのタブも同じく添える）
    group: (t, _chat, groupOf) => groupOf(t.projectId, t.group) ?? (t.groupName ? { name: t.groupName, hue: null } : undefined),
    projectOf: (t) => t.projectId,
    cluster: (t, r) => r.ofTarget(t.projectId, t.group, t.worktree),
  },
  subagent: {
    shows: "subagent",
    icon: Bot,
    badge: "サブ",
    // サブエージェントの中で起動したもの（入れ子）は「↳」を付け、乗せると外側からの道筋（「調査 › 洗い出し」）
    label: (t) => (t.path ? `↳ ${t.title}` : t.title),
    hint: (t) => t.path ?? t.title,
    projectOf: () => undefined,
    // そのチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    chatIdOf: (t) => t.chatId,
    cluster: () => OTHER_CLUSTER,
    popout: (t) => ({ route: { kind: "subagent", chatId: t.chatId, agentKey: t.agentKey }, title: `${t.title} — サブエージェント` }),
  },
  changes: {
    shows: "file",
    icon: FileDiff,
    label: () => "変更",
    hint: (t) => `コミットしていない変更（${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}）`,
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    chatIdOf: (t) => t.chatId,
    cluster: () => OTHER_CLUSTER,
    popout: (t) => ({
      route: { kind: "changes", chatId: t.chatId, projectId: t.projectId, ...(t.worktree ? { worktree: t.worktree } : {}) },
      title: `変更 — ${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}`,
    }),
  },
  projectView: {
    shows: "file",
    icon: FileText,
    // アイコンはプロジェクトの左の列のタブと同じ
    Lead: ProjectViewTabLead,
    label: (t) => PROJECT_VIEW_LABELS[t.view],
    hint: (t) => `プロジェクトの「${PROJECT_VIEW_LABELS[t.view]}」（${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}から）`,
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    chatIdOf: (t) => t.chatId,
    cluster: () => OTHER_CLUSTER,
  },
  file: {
    shows: "file",
    icon: FileText,
    // アイコンはエディタと同じファイルの種類のアイコン
    Lead: FileTabLead,
    label: (t) => baseName(t.path),
    hint: (t) => (t.line ? `${t.path}（${t.line} 行目）` : t.path),
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    chatIdOf: (t) => t.chatId,
    cluster: () => OTHER_CLUSTER,
    popout: (t) => ({
      route: { kind: "file", chatId: t.chatId, projectId: t.projectId, path: t.path, ...(t.worktree ? { worktree: t.worktree } : {}), ...(t.line ? { line: t.line } : {}) },
      title: t.path,
    }),
  },
  projectFile: {
    shows: "file",
    icon: FileText,
    Lead: FileTabLead,
    // 差分のタブは、同じファイルの中身のタブと見分ける（VS Code の「(Working Tree)」「(Index)」と同じ）
    label: (t) => `${baseName(t.path)}${t.staged === undefined || t.line !== undefined ? "" : t.staged ? "（ステージ済み）" : "（変更）"}`,
    hint: (t) => (t.line ? `${t.path}（${t.line} 行目）` : t.path),
    projectOf: (t) => t.projectId,
    // 見ていないタブのファイルまで読み込まない
    lazy: true,
    cluster: () => OTHER_CLUSTER,
  },
  memo: {
    shows: "file",
    icon: StickyNote,
    badge: "メモ",
    label: (t) => baseName(t.path),
    hint: (t) => `メモ: ${t.path}`,
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）。メモのタブの右（memos）で開いたものはチャットなし
    chatIdOf: (t) => t.chatId,
    cluster: () => OTHER_CLUSTER,
    popout: (t) => ({ route: { kind: "memo", projectId: t.projectId, path: t.path, ...(t.chatId !== null ? { chatId: t.chatId } : {}) }, title: `${baseName(t.path)} — メモ` }),
  },
  child: {
    shows: "subagent",
    icon: MessagesSquare,
    // 子チャットであることは札で見せる（前は名前の頭の「↳」だけで、サブエージェントの入れ子と見分けにくかった）
    badge: "子",
    // 孫より深いものは「孫」「ひ孫」にし、札と下線を深さの色にする（孫・ひ孫も同じ欄に子と並ぶので見分ける）
    BadgeText: ChildTabBadge,
    label: (t) => chatTitle(t.title),
    hint: (t) => `子チャット: ${chatTitle(t.title)}`,
    projectOf: (t) => t.projectId,
    // 子チャットを消したら閉じる（親を消すと子孫も消える）
    chatIdOf: (t) => t.childId,
    cluster: () => OTHER_CLUSTER,
    popout: (t) => ({ route: { kind: "chat", chatId: t.childId }, title: `${chatTitle(t.title)} — 子チャット` }),
  },
  newChild: {
    // 子チャットのタブと同じく、右の欄の決まった種類の中に出す
    shows: "subagent",
    icon: MessageSquarePlus,
    badge: "子",
    label: () => "新しい子チャット",
    hint: () => "新しい子チャット（このチャットの会話を引き継ぎ、最初の文を送ると始まります）",
    projectOf: (t) => t.projectId,
    // 親のチャットを消したら閉じる
    chatIdOf: (t) => t.chatId,
    cluster: () => OTHER_CLUSTER,
  },
  browser: {
    shows: "browser",
    icon: Globe,
    // 空のページのあいだは「新しいタブ」
    label: (t) => t.title || (t.url ? hostOf(t.url) : "新しいタブ"),
    hint: (t) => t.url,
    projectOf: () => undefined,
    cluster: () => OTHER_CLUSTER,
  },
  terminal: {
    shows: "terminal",
    icon: SquareTerminal,
    label: (t) => `ターミナル · ${t.label}`,
    hint: (t) => t.cwd,
    projectOf: (t) => t.projectId,
    dispose: (t) => void globalThis.window?.kickoff?.terminal.close(t.key),
    cluster: (t, r) => r.ofFolder(t.projectId, t.cwd),
  },
};

/** タブの種類の決まり（種類と中身の型を結びつけて引く） */
export const specOf = <T extends PanelTab>(tab: T) => TAB_KINDS[tab.kind] as unknown as TabKindSpec<T>;

/** 欄の「表示するタブ」でどの種類に入るか */
export const kindOfTab = (tab: PanelTab): PanelKind => specOf(tab).shows;

/** チャットのタブのチャット（サイドバーの一覧にあれば最新のもの、なければタブの中のチャットから届いたもの。チャットのタブでなければ undefined） */
export const tabChat = (tab: PanelTab | undefined, chats: readonly Chat[]): Chat | undefined =>
  tab?.kind === "chat" ? (chats.find((r) => r.id === tab.id) ?? tab.chat) : undefined;

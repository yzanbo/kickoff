import { Globe, MessageSquare, SquarePen, SquareTerminal, type LucideIcon } from "lucide-react";
import type { Chat } from "@shared/types";
import { NEW_CHAT_TITLE, chatTitle } from "@/features/chat/chatTitle";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import type { BucketHead } from "@/features/chatList/buckets";
import { normalizeUrl } from "@/lib/url";
import { OTHER_CLUSTER } from "@/features/panel/clusters/tabClusters";
import type { PanelKind } from "@/features/panel/state/panelKinds";
import type { NewChatTarget, PanelTab, TerminalTarget } from "./panelTypes";

/**
 * パネルのタブの種類（チャット・新しいチャット（下書き）・サブエージェント・ブラウザ・ターミナル）ごとの違いを集めた表。
 * タブを作る（キーの決め方）・欄の「表示するタブ」のどれに入るか・アイコンと名前・どのプロジェクトのものか・中身を作る時・閉じたときの後始末・
 * どのまとまりに入るかを、種類で分岐させずにここから引く。中身（どの部品を描き、中身からの知らせでタブをどう変えるか）は PanelTabPage の PAGES
 */

type TabKind = PanelTab["kind"];
type TabOf<K extends TabKind> = Extract<PanelTab, { kind: K }>;

/** 新しいタブ・ペインのキー（"<頭>:<時刻>:<乱数>"。ターミナルのキーは裏のシェルのキーにも使うので、同じ瞬間に 2 つ作っても重ならないよう乱数を添える） */
export const newTabKey = (prefix: "new" | "browser" | "terminal" | "pane") => `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

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
  ofTarget: (projectId: number, group?: number) => BucketHead;
  /** フォルダ（本体・ワークツリー）のまとまり（ターミナル。グループ別では「その他」） */
  ofFolder: (projectId: number, cwd: string) => BucketHead;
}

interface TabKindSpec<T extends PanelTab> {
  /** 欄の「表示するタブ」でどの種類に入るか（新しいチャット・サブエージェントはチャット） */
  shows: PanelKind;
  /** タブのアイコン（チャットのタブは、状態の印に置き換わる） */
  icon: LucideIcon;
  iconClass?: string;
  /** タブに出す名前（chat はタブのチャット（サイドバーの一覧にあれば最新のもの）） */
  label: (tab: T, chat: Chat | undefined) => string;
  /** マウスを乗せたときの説明（なければ名前とグループ名） */
  hint?: (tab: T) => string;
  /** 名前の後ろに控えめに添えるグループ名（nameOf はプロジェクトのグループ名を引く） */
  groupName?: (tab: T, chat: Chat | undefined, nameOf: (projectId: number, groupId: number | null | undefined) => string | undefined) => string | undefined;
  /** どのプロジェクトのタブか（まとまり・グループ名を引くのに使う。ブラウザはどれにも入らない） */
  projectOf: (tab: T) => number | undefined;
  /** どのチャットのタブか（そのチャットを消したら閉じる。チャット・サブエージェント） */
  chatIdOf?: (tab: T) => number;
  /** 中身を初めて表示したときに作るか（チャットのタブはサイドバーと連動して自動で増えるので、見ていないチャットまで読み込まない） */
  lazy?: boolean;
  /** 閉じたときの後始末（ターミナルはシェルも止める。ブラウザの開発者ツールは webview がなくなるときに BrowserPane が閉じる） */
  dispose?: (tab: T) => void;
  /** どのまとまりに入るか（グループ別・作業場所別にまとめるとき） */
  cluster: (tab: T, resolve: ClusterResolver) => BucketHead;
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
    groupName: (t, chat, nameOf) => nameOf(t.projectId, chat?.group_id),
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
    label: () => NEW_CHAT_TITLE,
    // 作成先のグループ名（パネルの中で分かりしだい入れる。送ったあとのチャットのタブも同じく添える）
    groupName: (t) => t.groupName,
    projectOf: (t) => t.projectId,
    cluster: (t, r) => r.ofTarget(t.projectId, t.group),
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

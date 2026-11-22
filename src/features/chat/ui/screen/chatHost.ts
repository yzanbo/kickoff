// チャットの画面の置き場所の値 ChatHost（パネルのタブ・右の欄の子チャット・別ウィンドウ・ノートのチャットの違いを 1 つの値に）と、チャットの種類
import type { Attachment, Chat, GitHubLink } from "@shared/chat/types";
import type { NewChatTarget } from "@/features/panel/ui";
import type { ChipsPortal } from "./chipsPortal";

/** 新しいチャットの入力欄に、初めに入れておくもの（送信待ちの指示・GitHub の issue から始めるとき） */
export interface NewChatSeed {
  text: string;
  attachments: Attachment[];
  /** 作るチャットに結び付ける GitHub の issue・PR（GitHub タブの「新しいチャット」） */
  github?: GitHubLink;
  /** 初めの作業場所を新しいワークツリーにするときのブランチ名（GitHub タブで「新しいワークツリー」を選んだとき） */
  newWorktreeBranch?: string;
}

/**
 * 置き場所ごとの違い（置く側が作って ChatScreen に渡す）。右の欄（PanelHostContext・AgentSplit）はまだこの値に入れていない。
 * 渡すたびに作り直してよい（中の関数は呼ぶときに読む）
 */
export interface ChatHost {
  /** 置き場所の名前 */
  readonly surface: "tab" | "side" | "window" | "note";
  /** 裏に回したら会話の欄を止めてよいか（パネルのタブ・右の欄の子チャット。ノートのチャット・別ウィンドウは止めない） */
  readonly pausable: boolean;
  /** 新しいチャットのタブを開く（送信待ちの指示・選んだ文を新しいチャットで聞くとき。パネルの外では渡さない） */
  readonly openNewChat?: (target: NewChatTarget, seed?: NewChatSeed) => void;
  /** この画面のあるタブを表に出す（パネルのタブの中だけ。隠れた画面で「移る」を受けたとき） */
  readonly bringToFront?: () => void;
  /** パネルのタブの置き場所（chatPaneSlot。タブの右クリックから会話 / 動きを切り替える） */
  readonly slot?: string;
  /** 送る前にすること（ノートのチャットで、書きかけのノートを保存してから送る） */
  readonly beforeSend?: () => Promise<void>;
  /** ピルの列と送信待ちを画面の外に描く先（ノートのチャット） */
  readonly chipsPortal?: ChipsPortal | null;
  /** 足す先のチャット（右の欄・別ウィンドウの中ならその右の欄を持つ / 開いたチャット。ほかは null で、外の MainChatContext を使う） */
  readonly mainChatId: number | null;
}

/** チャットの種類（ふつう・子チャット・ノートのチャット） */
export type ChatRole = "chat" | "child" | "note";

export const chatRoleOf = (chat: Pick<Chat, "parent_chat_id" | "note_path">): ChatRole => (chat.note_path ? "note" : chat.parent_chat_id !== null ? "child" : "chat");

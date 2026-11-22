// 送る口の本文・答えの形（新しいチャット・POST /api/chats/:chatId/messages・POST /api/chats/:chatId/queue・POST /api/chats/:chatId/queue/send・PUT /api/chats/:chatId/queue/editing）。
import type { HandoffFrom } from "./chatEvent";
import type { QueueState } from "./chatLive";
import type { QueueCommand } from "./queueCommand";
import type { Chat, GitHubLink, MessageBody } from "./types";
import type { ProviderId } from "@shared/settings/types";

/**
 * 新しいチャットの最初の指示（POST /api/projects/:projectId/chats）。作業場所は、いまあるワークツリーのフォルダ（worktree_path）か、
 * 新しく作るワークツリーのブランチ名（new_worktree_branch）。どちらもなければ本体
 */
export interface NewChatBody extends MessageBody {
  /** 送る前に付けた名前（あれば AI に名前を付けてもらわない） */
  title?: string;
  group_id?: number;
  worktree_path?: string;
  new_worktree_branch?: string;
  /** 結び付ける GitHub の issue・PR（issue から始めた・レビューコメントで直すチャット） */
  github?: GitHubLink;
  /** 動かす AI（省けばプロジェクトの AI。作ったあとは変えない） */
  provider?: ProviderId;
}

/**
 * 続きを送る・止めずに伝える指示（POST /api/chats/:chatId/messages）。
 * pause_after なら「質問として送る」: この指示の作業が終わったら、送信待ちを自動で送らずに一時停止する（答えを見て次を決める）
 */
export interface SendMessageBody extends MessageBody {
  pause_after?: boolean;
  /** 子チャットに親への依頼文を頼む発言（記録に印を付ける） */
  handoff_request?: boolean;
  /** 子チャットから渡した依頼（親チャットの発言。どの子チャットからか） */
  handoff_from?: HandoffFrom;
}

/** 送信待ちに送る指示（POST /api/chats/:chatId/messages の when: later）。hold なら、作業していなくても送らずに列の最後に足す。pause_after は SendMessageBody と同じ（列に入れたら、その指示のすぐあとに一時停止の印を付ける） */
export interface QueueMessageBody extends SendMessageBody {
  hold?: boolean;
}

/**
 * 送った結果の種類（POST /api/chats/:chatId/messages の result）: told = いまのやり取りに足した / queued = 待ちの列に入れた / sent = すぐ送った /
 * held = 圧縮前指示から圧縮のあとのやり取りが終わるまでなので預かった（そのやり取りが終わったら送る。ChatLive の now）
 */
export interface TellResult {
  result: "told" | "queued" | "sent" | "held";
}

/**
 * 送る（POST /api/chats/:chatId/messages）。when: now = 止めずに伝える（作業していなければすぐ送る）/ later = 作業中なら送信待ちに入れる
 * （作業していなければすぐ送る。hold なら送らずに列の最後）。省けば作業中は 409（前からの送る口。答えはチャット）
 */
export interface SendBody extends QueueMessageBody {
  when?: "now" | "later";
}

/** 送った結果（when を書いたとき）: sent = すぐ送った / told = いまの作業に足した / held = 預かった / queued = 送信待ちに入れた。そのあとのチャットと送信待ち */
export interface SendResult {
  result: TellResult["result"];
  chat: Chat;
  queue: QueueState;
}

/** 送信待ちを変える命令の列（POST /api/chats/:chatId/queue。全部通るか、1 つも変えない。答えはそのあとの送信待ち） */
export interface QueueCommandsBody {
  commands: QueueCommand[];
}

/** 送信待ちをすぐ送る（POST /api/chats/:chatId/queue/send。now = その 1 件 / all = まとめて 1 件にして（ids でその指示だけ）/ in_order = 1 件ずつ順に） */
export type QueueSendBody = { mode: "now"; ids: [string] } | { mode: "all"; ids?: string[] } | { mode: "in_order" };

/** 画面で書き直している行（PUT /api/chats/:chatId/queue/editing。丸ごと置き換え、空なら外す。lane を省けば送信待ち） */
export interface QueueEditingBody {
  lane?: "now" | "later";
  ids: string[];
}

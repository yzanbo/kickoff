// チャットの SSE の種類（device = 端末にも届ける）
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";
import type { Approval } from "./approvalTypes";
import type { ChatEvent } from "./chatEvent";
import type { CommandOutput, SubagentInfo } from "@shared/ai/turnEvents";
import type { ChatLive } from "./chatLive";
import type { ChatDraftRequest, OpenViewRequest } from "./openView";
import type { Chat } from "./types";

export const chatEvents = {
  chat: event<{ chat: Chat }>({ access: "device" }),
  chat_deleted: event<{ id: number; project_id: number }>({ access: "device" }),
  chat_event: event<{ project_id: number; event: ChatEvent }>({ access: "device" }),
  /** 会話の記録の from_event_id から後ろ（それを含む）を消した（巻き戻し。画面の記録からも消す） */
  chat_events_deleted: event<{ project_id: number; chat_id: number; from_event_id: number }>({ access: "device" }),
  /** AI の返答の途中経過（保存しない。確定した文は chat_event の text で届く） */
  chat_delta: event<{
    project_id: number;
    chat_id: number;
    text: string;
    /** 書きかけの返答の中で text が始まる位置（UTF-16 の長さ。コアのバスが流すときに付ける。チャットの詳細の streaming_length と同じ数え方） */
    offset: number;
  }>({ access: "device" }),
  /** サブエージェントの途中経過（トークン数・直近のツール。保存しない） */
  chat_subagent: event<{ project_id: number; chat_id: number; subagent: SubagentInfo }>({ access: "device" }),
  /** 実行中のコマンドの出力の終わりの部分（増えるたびに丸ごと。保存しない。結果はツールの結果の記録で届く） */
  chat_command_output: event<{ project_id: number; chat_id: number; output: CommandOutput }>({ access: "device" }),
  /** 作業中の様子（送信待ち・裏の作業・再試行・再接続待ち・圧縮中・停止中）。どれかが変わるたびに全体を送る（チャットの詳細の live と同じ形） */
  chat_live: event<{ project_id: number; chat_id: number; live: ChatLive }>({ access: "device" }),
  approval: event<{ approval: Approval }>({ access: "device" }),
  approval_resolved: event<{ id: string; chat_id: number }>({ access: "device" }),
  /** チャットの AI が、ノート・家系のチャット・ファイル・差分・SQL を開くよう頼んだ（Mac のアプリのメインのウィンドウだけが受けて開く。kickoff_chat の open_…） */
  open_view: event<{ request: OpenViewRequest }>(),
  /** チャットの AI が、家系のチャットの入力欄に下書きを入れるよう頼んだ（Mac のアプリのメインのウィンドウだけが受けて入れる。kickoff_chat の add_draft） */
  chat_draft: event<{ request: ChatDraftRequest }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof chatEvents> {}
}

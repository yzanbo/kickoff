// 子チャットの取り決めに出る形（子チャットで聞く・親へ渡す・サブエージェントについて聞く・親から外す）
import type { HandoffVia } from "@shared/chat/chatEvent";
import type { TellResult } from "@shared/chat/send";
import type { Attachment, ChatOptionsPatch, MessageBody } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";

/** 子チャットで聞く（POST /api/chats/:chatId/children）。inherit なら親の会話を引き継ぐ（省けば引き継ぐ）。quote は親の会話から選んだ文、event_id は聞いた位置の記録 */
export interface ChildChatBody {
  text?: string;
  quote?: string | null;
  inherit?: boolean;
  event_id?: number | null;
  options?: ChatOptionsPatch;
  /** 添付（チャット欄から子チャットに送るとき。文が空でも添付があれば送れる） */
  attachments?: Attachment[];
  /** 動かす AI（省けば親と同じ。違う AI なら会話は引き継がない） */
  provider?: ProviderId;
}

/** サブエージェントに子チャットで聞く（POST /api/chats/:chatId/subagents/:agentId/children。サブエージェントの会話の記録を添付にして始める）。形は送る指示と同じ */
export type SubagentChildBody = MessageBody;

/** 子チャットの作業の最後の返答を、親チャットに渡す（POST /api/chats/:chatId/handoff。turn_event_id は作業の終わりの記録） */
export interface HandoffBody {
  via: HandoffVia;
  turn_event_id: number;
}

/**
 * 親チャットに渡した結果: text = 渡した文（作業の最後の返答。入力欄に入れるときは画面がこれを入れる）・parent_chat_id = 渡した先（直接の親）・
 * sent = 今すぐ送るなら伝えた結果（told / queued / sent / held）、送信待ちなら queued、入力欄なら null
 */
export interface HandoffResult {
  text: string;
  parent_chat_id: number;
  sent: TellResult["result"] | null;
}

/**
 * 子チャットを親から外す（POST /api/chats/:chatId/detach）。parent_chat_id: null なら親のないチャット（group_id のグループへ。省く・null ならグループなし）、
 * 自分の先祖（親の親より上）の ID ならその子にする（group_id は渡さない）
 */
export interface ChatDetachBody {
  parent_chat_id: number | null;
  group_id?: number | null;
}

// チャットへの送り方の決まり（画面は when・hold・pause_after を決めて送る口 1 本に渡すだけ。React と API に依存しない）
import type { HandoffFrom, MessageMarks } from "@shared/chat/chatEvent";
import type { SendBody } from "@shared/chat/send";
import type { Attachment, ChatOptionsPatch } from "@shared/chat/types";
import type { SendWhen } from "../composerKeys";
import type { OutgoingMessage } from "../composerModel";

/** 入力欄に入れた子チャットからの依頼の出どころ（読む・消す。持ち主は childChats） */
export interface HandBackFrom {
  read: () => HandoffFrom | null;
  clear: () => void;
}

export interface ChatSendDeps {
  busy: boolean;
  /** 送信待ちがあるか（作業していなくても、送り方を選ぶ） */
  queued: boolean;
  /** チャット欄の切り替え（いま / あとで） */
  mode: SendWhen;
  options: ChatOptionsPatch;
  /** 送る口 1 本（POST /api/chats/:id/messages） */
  send: (body: SendBody) => Promise<unknown>;
  cancel: () => Promise<void>;
  /** 中断の前に、裏のサブエージェント・コマンドも止まることを確かめる（やめたら false） */
  confirmStop: () => Promise<boolean>;
  onStopping: (stopping: boolean) => void;
  /** 送る前にすること（ノートのチャットで、書きかけのノートを保存してから送る。SendCancelled を投げれば送らない） */
  beforeSend?: () => Promise<void>;
  /** 送る直前（流れの一番下に付いていく） */
  afterSend?: () => void;
  from?: HandBackFrom;
}

/**
 * このチャットへの送り方（決まりはコアの送る口の when。画面は when・hold・pause_after を決めて渡すだけ）:
 * - 作業していなくて送信待ちもない: 続きを送る（when なし）
 * - 作業中: いま = 止めずに伝える（when: now）/ あとで = 送信待ちへ（when: later）。mode はキーで決めたとき（省けば切り替えのとおり）
 * - 作業していなくて止めている送信待ちがある: すぐ送る = 送信待ちより先に送る（when なし）/ ためておく = 列の最後に足す（when: later・hold）
 * asQuestion は「質問として送る」（pause_after）。viaComposer は入力欄から送るもの（子チャットからの依頼の出どころを付け、送れたら消す）
 */
export function createChatSend(d: ChatSendDeps) {
  const deliver = async (body: SendBody, follow: boolean) => {
    await d.beforeSend?.();
    if (follow) d.afterSend?.();
    await d.send(body);
  };
  const route = (text: string, attachments: Attachment[], mode: SendWhen, extra: Partial<SendBody>) => {
    const body: SendBody = { text, options: d.options, attachments, ...extra };
    if (!d.busy && !d.queued) return deliver(body, true);
    if (!d.busy) return mode === "later" ? deliver({ ...body, when: "later", hold: true }, false) : deliver(body, true);
    return deliver({ ...body, when: mode }, true);
  };
  return {
    async submit({ text, attachments }: OutgoingMessage, mode?: SendWhen, opts: { asQuestion?: boolean; viaComposer?: boolean } = {}) {
      const from = opts.viaComposer ? (d.from?.read() ?? null) : null;
      const marks: MessageMarks = from ? { handoff_from: from } : {};
      await route(text, attachments, mode ?? d.mode, { ...(opts.asQuestion ? { pause_after: true } : {}), ...marks });
      if (from) d.from?.clear();
    },
    async stop() {
      if (!(await d.confirmStop())) return;
      d.onStopping(true);
      await d.cancel().catch(() => d.onStopping(false));
    },
  };
}


// 入力欄の束（送る口と作業中の様子）と、送れるかの決まり（純粋。React に依存しない）
import type { LucideIcon } from "lucide-react";
import type { Attachment } from "@shared/chat/types";
import type { QueueSendMode } from "./composerKeys";

/** 送るもの（入力欄の文と添付） */
export interface OutgoingMessage {
  text: string;
  attachments: Attachment[];
}

/** 送信ボタンの右クリック・▾ で選ぶ、ほかの送り方・送り先（質問として送る・新規の子チャットに送る）。作業中でも送れる */
export interface SendTarget {
  label: string;
  /** 名前の下に小さく添える、何が起きるかの一言 */
  hint?: string;
  icon?: LucideIcon;
  /** 組の見出し（同じ見出しの項目を続けて並べる） */
  group?: string;
  title?: string;
  submit: (message: OutgoingMessage) => Promise<void>;
}

/** 入力欄の送る口と作業中の様子（置く側が渡す） */
export interface ComposerSend {
  /** 作業中（送ると、いま / あとでの送り方で送る。送り方の切り替えを出す） */
  busy?: boolean;
  /** 停止を頼んで、止まるのを待っている */
  stopping?: boolean;
  /** 会話の圧縮中（中断のボタンを出さず、右下をふだんの見た目にする） */
  compacting?: boolean;
  /** 止めている送信待ちがある（作業していなくても、すぐ送る / ためておくを選ぶ） */
  holdsQueue?: boolean;
  /** 入力欄から送る。mode はキーで決めたとき（⌘Enter = tell・⌘⇧Enter = queue。省けば切り替えのとおり）。SendCancelled ならやめただけ */
  submit: (message: OutgoingMessage, mode?: QueueSendMode) => Promise<void>;
  /** 入力欄の文でないもの（定型文の「すぐ送る」）を送る。省けば定型文は入れるだけ */
  sendOther?: (text: string) => Promise<void>;
  /** 中断（省けば中断のボタンを出さない） */
  stop?: () => void;
  alternatives?: readonly SendTarget[];
  /** 送信ボタンの説明（省けば既定の文） */
  label?: string;
}

/**
 * 送れるか: 作業中・止めている送信待ちがあるときは送り方を選んで送る（queueing）。アップロードの途中・送っている途中は送らない。
 * 送信ボタン・Enter は、書いているか録音中のとき（録音中は起こした文を入れてから送る）。ほかの送り先は書いていれば作業中でも
 */
export function composerModel(i: { text: string; attachments: number; uploading: boolean; sending: boolean; busy: boolean; holdsQueue: boolean; recording: boolean }) {
  const queueing = i.busy || i.holdsQueue;
  const hasContent = i.text.trim() !== "" || i.attachments > 0;
  const ready = !i.uploading && !i.sending;
  return { queueing, hasContent, ready, canSend: (hasContent || i.recording) && ready, viaReady: ready && hasContent && !i.recording };
}

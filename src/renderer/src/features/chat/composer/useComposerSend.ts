import { useState } from "react";
import type { Attachment } from "@shared/types";
import { errorMessage } from "@shared/errors";
import type { QueueSendMode } from "./composerKeys";

/** onSend で投げると、送るのをやめたことになる（書いた文は残し、失敗の文も出さない。確かめのダイアログでやめたときなど） */
export class SendCancelled extends Error {}

/**
 * チャット欄の送る処理（Composer）。作業中は、待ちの列に入れられるとき（onQueue）だけ送れる
 * （送信待ちがあるときは、作業していなくても送り方を選ぶ = queueWhileIdle）。アップロードの途中・送っている途中は送らない。
 * 送れたら onSent（文と添付を空にする）。SendCancelled で止めたら、やめただけ（文を残し、失敗の文も出さない）
 */
export function useComposerSend({
  text,
  files,
  busy,
  queueWhileIdle,
  onSend,
  onQueue,
  onSent,
}: {
  text: string;
  /** 添付（アップロードできたものと、途中のものがあるか） */
  files: { attachments: Attachment[]; uploading: boolean };
  busy?: boolean;
  queueWhileIdle?: boolean;
  onSend: (text: string, attachments: Attachment[]) => Promise<void>;
  onQueue?: (text: string, attachments: Attachment[], mode?: QueueSendMode) => Promise<void>;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  // 作業中は、待ちの列に入れられるときだけ送れる（送信待ちがあるときは、作業していなくても送り方を選ぶ）
  const queueing = Boolean((busy || queueWhileIdle) && onQueue);
  const hasContent = Boolean(text.trim() || files.attachments.length > 0);
  const ready = !files.uploading && !sending && (!busy || queueing);
  // 別の送り先へ送れるか（作業中かは問わない）
  const viaReady = !files.uploading && !sending && hasContent;

  /** 文と添付を action で送る（送れたら空にする。SendCancelled ならやめただけ） */
  async function deliver(message: string, action: (text: string, attachments: Attachment[]) => Promise<void>) {
    setSending(true);
    setError(undefined);
    try {
      await action(message, files.attachments);
      onSent();
    } catch (e) {
      if (!(e instanceof SendCancelled)) setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  /** 送る（body を渡せば、いまの文の代わりにそれを送る。音声入力で入れてそのまま送るとき。mode は作業中の送り方をキーで決めたとき） */
  async function send(body?: string, mode?: QueueSendMode) {
    const message = (body ?? text).trim();
    if (!ready || !(message || files.attachments.length > 0)) return;
    await deliver(message, (t, a) => (queueing ? onQueue!(t, a, mode) : onSend(t, a)));
  }

  /** このチャットの代わりに、別の送り先（子チャットなど）へ送る。作業中でも送れる（このチャットの作業とは別に動くので） */
  async function sendVia(action: (text: string, attachments: Attachment[]) => Promise<void>) {
    if (viaReady) await deliver(text.trim(), action);
  }

  return { send, sendVia, error, queueing, hasContent, ready, viaReady };
}

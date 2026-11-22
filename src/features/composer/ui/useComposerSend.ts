import { useState } from "react";
import type { Attachment } from "@shared/chat/types";
import { errorMessage } from "@shared/foundation/errors";
import type { SendWhen } from "./composerKeys";
import { composerModel, type ComposerSend, type OutgoingMessage, type SendTarget } from "./composerModel";

/** onSend で投げると、送るのをやめたことになる（書いた文は残し、失敗の文も出さない。確かめのダイアログでやめたときなど） */
export class SendCancelled extends Error {}

/** run を流し、失敗は onError で受け止め、最後に onDone（try / finally を hook の外に置く。React Compiler は hook の中の finally を扱えないため） */
async function settle(run: () => Promise<void>, onError: (e: unknown) => void, onDone: () => void) {
  try {
    await run();
  } catch (e) {
    onError(e);
  } finally {
    onDone();
  }
}

/**
 * チャット欄の送る処理（Composer）。送れるかは composerModel（作業中・止めている送信待ちがあるときは送り方を選んで送る。
 * アップロードの途中・送っている途中は送らない）。送れたら onSent（文と添付を空にする）。SendCancelled で止めたら、やめただけ（文を残し、失敗の文も出さない）
 */
export function useComposerSend({
  text,
  files,
  send: port,
  recording,
  onSent,
}: {
  text: string;
  /** 添付（アップロードできたものと、途中のものがあるか） */
  files: { attachments: Attachment[]; uploading: boolean };
  send: ComposerSend;
  recording: boolean;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const model = composerModel({ text, attachments: files.attachments.length, uploading: files.uploading, sending, busy: Boolean(port.busy), holdsQueue: Boolean(port.holdsQueue), recording });

  /** 文と添付を action で送る（送れたら空にする。SendCancelled ならやめただけ） */
  async function deliver(message: string, action: (message: OutgoingMessage) => Promise<void>) {
    setSending(true);
    setError(undefined);
    await settle(
      async () => {
        await action({ text: message, attachments: files.attachments });
        onSent();
      },
      (e) => {
        if (!(e instanceof SendCancelled)) setError(errorMessage(e));
      },
      () => setSending(false),
    );
  }

  /** 送る（mode は作業中の送り方をキーで決めたとき） */
  async function send(mode?: SendWhen) {
    const message = text.trim();
    if (!model.ready || !(message || files.attachments.length > 0)) return;
    await deliver(message, (m) => port.submit(m, mode));
  }

  /** 右クリックで選んだ送り方・送り先（質問として送る・子チャットなど）で送る。作業中でも送れる（作業中にどう送るかは target が決める） */
  async function sendVia(target: SendTarget) {
    if (model.viaReady) await deliver(text.trim(), target.submit);
  }

  return { send, sendVia, error, ...model };
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { QueuedMessage } from "@shared/types";
import { isQueueAction } from "@shared/chat/queueActions";
import { removedHere } from "@/api/queueRemovals";

/** チャット欄に発言が出なくても「送信中」をやめるまでの時間（伝えずに預かった・送れなかったときの保険） */
const SENDING_MS = 3000;

/** 送った指示: after は消えた時点で画面が知っていた、いちばん新しい自分の発言の記録の ID（これより新しい発言が届いたら出し終える） */
interface Sending {
  message: QueuedMessage;
  after: number;
}

/**
 * 送信待ちから消えた指示のうち、送ったもの（この画面で消した・まとめた・移したものと、挟む行は除く）を、
 * チャット欄（流れ）にその発言が出るまで「送信中」として残す。コアは送信待ちから外してから発言を記録するので、
 * そのままだと送った指示が送信待ちからもチャット欄からも消えて見える間ができる。
 * lastUserEventId: 流れに出ている、いちばん新しい自分の発言の記録の ID（なければ 0）
 */
export function useSendingQueued(chatId: number, messages: QueuedMessage[], lastUserEventId: number): QueuedMessage[] {
  const [sending, setSending] = useState<Sending[]>([]);
  // 前に描いたときの送信待ちと、そのとき知っていた発言（送信待ちの知らせと発言の知らせが一緒に届いても見分けられるように）
  const [prev, setPrev] = useState(messages);
  const seen = useRef(lastUserEventId);
  if (prev !== messages) {
    setPrev(messages);
    const gone = prev.filter((m) => !isQueueAction(m) && !messages.some((x) => x.id === m.id) && !removedHere(chatId, m.id));
    // 消えたのと同じ描き直しで発言も届いていれば、残さない（もう流れに出ている）
    if (gone.length > 0 && lastUserEventId <= seen.current) {
      setSending((list) => [...gone.map((message) => ({ message, after: seen.current })), ...list]);
    }
  }
  useLayoutEffect(() => {
    seen.current = lastUserEventId;
  });
  // 出し終えたもの（発言が届いた）を片付け、届かないものも少し待ってやめる
  useEffect(() => {
    if (sending.length === 0) return;
    if (sending.some((s) => lastUserEventId > s.after)) {
      setSending((list) => list.filter((s) => lastUserEventId <= s.after));
      return;
    }
    const timer = window.setTimeout(() => setSending([]), SENDING_MS);
    return () => window.clearTimeout(timer);
  }, [sending, lastUserEventId]);
  // 送信待ちに戻ったもの（送れずに戻した）は出さない
  return sending.filter((s) => lastUserEventId <= s.after && !messages.some((m) => m.id === s.message.id)).map((s) => s.message);
}

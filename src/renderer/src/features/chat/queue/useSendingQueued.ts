import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { QueuedMessage } from "@shared/types";
import { isQueueAction } from "@shared/chat/queueActions";
import { removedHere } from "@/api/queueRemovals";

/** 送った指示がほかの所に出なくても「送信中」をやめるまでの時間（送れなかったときの保険） */
const SENDING_MS = 3000;

/** 送った指示: shown は消えた時点で画面が知っていた「送った指示が出る所」の印（これが変わったら出し終える） */
interface Sending {
  message: QueuedMessage;
  shown: string;
}

/**
 * 送った指示が出る所（流れのいちばん新しい自分の発言と、圧縮が終わるまで預かった指示）の印。
 * 送った指示は、そのまま送れば流れに自分の発言として、圧縮中などで預かればチャット欄の下の預かりの吹き出しとして出るので、
 * どちらかが変わったら、送った指示はもう画面のどこかに見えている
 */
export function sentShownKey(lastUserEventId: number, held: { id: string }[]): string {
  return `${lastUserEventId}|${held.map((m) => m.id).join()}`;
}

/**
 * 送信待ちから消えた指示のうち、送ったもの（この画面で消した・まとめた・移したものと、挟む行は除く）を、
 * その指示が画面のほかの所に出るまで（流れの自分の発言・預かりの吹き出し。sentShownKey）「送信中」として残す。
 * コアは送信待ちから外してから発言を記録するので、そのままだと送った指示が送信待ちからもチャット欄からも消えて見える間ができる
 */
export function useSendingQueued(chatId: number, messages: QueuedMessage[], shown: string): QueuedMessage[] {
  const [sending, setSending] = useState<Sending[]>([]);
  // 前に描いたときの送信待ちと、そのときの印（送信待ちの知らせと発言の知らせが一緒に届いても見分けられるように）
  const [prev, setPrev] = useState(messages);
  const seen = useRef(shown);
  if (prev !== messages) {
    setPrev(messages);
    const gone = prev.filter((m) => !isQueueAction(m) && !messages.some((x) => x.id === m.id) && !removedHere(chatId, m.id));
    // 消えたのと同じ描き直しで、もうほかの所に出ていれば残さない
    if (gone.length > 0 && shown === seen.current) {
      setSending((list) => [...gone.map((message) => ({ message, shown: seen.current })), ...list]);
    }
  }
  useLayoutEffect(() => {
    seen.current = shown;
  });
  // 出し終えたもの（ほかの所に出た）を片付け、出ないものも少し待ってやめる
  useEffect(() => {
    if (sending.length === 0) return;
    if (sending.some((s) => s.shown !== shown)) {
      setSending((list) => list.filter((s) => s.shown === shown));
      return;
    }
    const timer = window.setTimeout(() => setSending([]), SENDING_MS);
    return () => window.clearTimeout(timer);
  }, [sending, shown]);
  // 送信待ちに戻ったもの（送れずに戻した）は出さない
  return sending.filter((s) => s.shown === shown && !messages.some((m) => m.id === s.message.id)).map((s) => s.message);
}

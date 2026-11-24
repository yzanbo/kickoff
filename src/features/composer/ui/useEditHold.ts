import { useEffect, useEffectEvent, useRef } from "react";
import { EDIT_HOLD_TTL_MS } from "@shared/chat/queueEditHolds";

/**
 * 書き直している行をコアに知らせ続ける（送信待ちと預かりの 2 つ。持ち時間 EDIT_HOLD_TTL_MS の 1/4 ごとに知らせ直す）。
 * 空になったら一度だけ外し（一度も知らせていなければ何もしない）、欄ごと消えた・チャットが替わったときも外す（落ちたら持ち時間で外れて送る）。
 * tell はチャットを引数で受ける（替わる前のチャットに外す知らせを届けるため）。失敗は無視する（次の知らせ直しか持ち時間に任せる）
 */
export function useEditHold(chatId: number, ids: readonly string[], tell: (chatId: number, ids: string[]) => Promise<unknown>): void {
  const key = [...ids].sort().join("\n");
  const told = useRef(false);
  const send = useEffectEvent((to: number, list: string[]) => void tell(to, list).catch(() => undefined));
  useEffect(() => {
    const list = key ? key.split("\n") : [];
    if (list.length === 0 && !told.current) return;
    told.current = list.length > 0;
    send(chatId, list);
    if (list.length === 0) return;
    const timer = setInterval(() => send(chatId, list), EDIT_HOLD_TTL_MS / 4);
    return () => clearInterval(timer);
  }, [chatId, key]);
  useEffect(
    () => () => {
      if (told.current) send(chatId, []);
      told.current = false;
    },
    [chatId],
  );
}

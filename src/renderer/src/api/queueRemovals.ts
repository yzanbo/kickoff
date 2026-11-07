/**
 * この画面から消した送信待ちの指示（消す・まとめて消す・すべて消す・1 つにまとめる・別のチャットへ移す）。
 * 送信待ちから消えた指示が「送った」のか「消した」のかを画面で見分けるために覚える（送ったものだけ、チャット欄に出るまで「送信中」で残す）。
 * 応答が届くまでの短い間だけ使うので、しばらくで忘れる
 */
const KEEP_MS = 10_000;
/** 消した指示の ID → 消した時刻 */
const removed = new Map<string, number>();
/** すべて消したチャット → 消した時刻 */
const cleared = new Map<number, number>();

const forgetOld = (now: number) => {
  for (const [id, at] of removed) if (now - at > KEEP_MS) removed.delete(id);
  for (const [chatId, at] of cleared) if (now - at > KEEP_MS) cleared.delete(chatId);
};

/** 消す指示を覚える（"all" はそのチャットの送信待ちをすべて）。消す API を呼ぶ前に呼ぶ（応答より先に送信待ちの知らせが届くため） */
export function noteQueuedRemoved(chatId: number, ids: string[] | "all"): void {
  const now = Date.now();
  forgetOld(now);
  if (ids === "all") cleared.set(chatId, now);
  else for (const id of ids) removed.set(id, now);
}

/** その指示をこの画面から消したか（送ったのではない） */
export function removedHere(chatId: number, id: string): boolean {
  const now = Date.now();
  const at = removed.get(id) ?? cleared.get(chatId);
  return at !== undefined && now - at <= KEEP_MS;
}

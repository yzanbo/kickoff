/**
 * チャットの記録を足す以外の形で変えた知らせ（巻き戻しで消した・セッションを付け替えた・チャットを消した）。
 * 記録から作って覚えたもの（コアの索引の覚え。chat/chatIndexCache.ts）を捨てる合図にする。記録を足すだけなら知らせない
 * （記録は後ろに足すだけで、ID は使い回さないので、覚えた分はそのまま使える）
 */
export interface LogRevisions {
  /** そのチャットの記録を書き換えた */
  changed(chatId: number): void;
  /** 書き換えを受け取る（やめる関数を返す） */
  subscribe(listener: (chatId: number) => void): () => void;
}

export function createLogRevisions(): LogRevisions {
  const listeners = new Set<(chatId: number) => void>();
  return {
    changed(chatId) {
      for (const listener of listeners) listener(chatId);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

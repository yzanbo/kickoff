import { createContext, useContext } from "react";

/**
 * チャット欄の上のピルの列と送信待ちを、チャットの画面の外に描く先（メモのチャットの欄を閉じている間、メモの下の入力欄の上に出す）。
 * ピル・送信待ちはチャットの画面の中の部品のまま（同じ記録・操作）で、置き場所だけを移す。会話へ移る操作（指示へ移る・サブエージェントを開く・動きを見る）は、
 * 先に reveal で画面を見せてから行う（閉じた欄の中で移っても見えないため）
 */
export interface ChipsPortal {
  /** ピルの列を描く先の要素（まだ描いていなければ null） */
  target: HTMLElement | null;
  /** 送信待ちを描く先の要素（外の入力欄のすぐ上。まだ描いていなければ null） */
  queueTarget: HTMLElement | null;
  /** 送信待ちがあるかを知らせる（外の入力欄も、チャット欄と同じく送信待ちがあれば送信待ちに足す） */
  onQueued: (queued: boolean) => void;
  /** チャットの画面を見せる（メモのチャットの欄を開く） */
  reveal: () => void;
}

export const ChipsPortalContext = createContext<ChipsPortal | null>(null);

/** ピルの列を外に描く先（なければ null = いつもの場所に描く） */
export function useChipsPortal(): ChipsPortal | null {
  return useContext(ChipsPortalContext);
}

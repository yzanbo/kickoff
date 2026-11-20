// ダイアログの依頼の順番待ち（純粋）: 出ているのは先頭。開いている間に来た依頼は後ろに並べ、閉じたら次を出す

/** 依頼を後ろに並べる */
export function pushAsk<R>(queue: readonly R[], req: R): readonly R[] {
  return [...queue, req];
}

/** 出ていた依頼（先頭）を閉じて、次を出す（先頭でなければ何もしない。同じ依頼を 2 回閉じても次の依頼を落とさない） */
export function finishAsk<R>(queue: readonly R[], req: R): readonly R[] {
  return queue[0] === req ? queue.slice(1) : queue;
}

let lastId = 0;
/** 依頼の番号（依頼ごとにダイアログを作り直す key） */
export const nextAskId = (): number => ++lastId;

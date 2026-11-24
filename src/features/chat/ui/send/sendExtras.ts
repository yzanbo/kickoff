// 送る本文に添える、上の機能の項目（userView の「送った時点の画面の様子」など）。chat は中身を知らず、上の機能が置いた関数が返す項目を足す
// （api は app・features を import しない。上の機能は chat を読めるので、ここに関数を置く）

let extras: (() => Record<string, unknown>) | null = null;

/** 送る本文に足す項目を返す関数を置く（1 つ。返した関数で外す） */
export function setSendExtras(fn: () => Record<string, unknown>): () => void {
  extras = fn;
  return () => {
    if (extras === fn) extras = null;
  };
}

/** 送る本文に、置いた関数の項目を足す（置いていなければそのまま。集めるのに失敗しても送るのは止めない） */
export function withSendExtras<T extends object>(body: T): T {
  try {
    return extras ? { ...body, ...extras() } : body;
  } catch {
    return body;
  }
}

// 保存した DB のパスワードをキーチェーンで開けなかったときに、利用者に聞く順番待ち（描くのは DbUnlockHost。ウィンドウに 1 つ）。
// 同じ接続への同時の頼みは 1 つの問いを待ち、いくつもの接続なら 1 つずつ聞く
import { createCell } from "@/foundation/ui/store";

/** 聞いている接続 */
export interface DbPasswordRequest {
  projectId: number;
  connectionId: number;
  resolve: (entered: boolean) => void;
}

/** 聞く順（先頭がいま出している問い） */
export const dbPasswordQueue = createCell<DbPasswordRequest[]>([]);
const asking = new Map<number, Promise<boolean>>();
let hosts = 0;

/** パスワードを聞く（入れてもらえたら true。聞く画面がなければ false） */
export function askDbPassword(projectId: number, connectionId: number): Promise<boolean> {
  if (hosts === 0) return Promise.resolve(false);
  const known = asking.get(connectionId);
  if (known) return known;
  const answer = new Promise<boolean>((resolve) => dbPasswordQueue.set([...dbPasswordQueue.get(), { projectId, connectionId, resolve }]));
  asking.set(connectionId, answer);
  void answer.then(() => asking.delete(connectionId));
  return answer;
}

/** いまの問いに答えて、次へ */
export function finishDbPassword(entered: boolean): void {
  const [current, ...rest] = dbPasswordQueue.get();
  if (!current) return;
  dbPasswordQueue.set(rest);
  current.resolve(entered);
}

/** 聞く画面を置く（返した関数で外す。外したら待っている問いはやめたことにする） */
export function attachDbPasswordHost(): () => void {
  hosts++;
  return () => {
    hosts--;
    if (hosts > 0) return;
    const waiting = dbPasswordQueue.get();
    dbPasswordQueue.set([]);
    for (const r of waiting) r.resolve(false);
  };
}

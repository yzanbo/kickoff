// いくつかの画面（メインのウィンドウと別ウィンドウ）に同じ頼みを送ったときの答えのまとめ方（AI の埋め込みブラウザの頼み。agentBrowser.ts）

/**
 * count 個の画面の答えを受け取る口を返す: 受け持てた答え（ok）が届いたらすぐそれで resolve し、どれも受け持てなければ最後の答えで resolve する。
 * 決まったあとに届いた答えは捨てる
 */
export function gatherReplies<T>(count: number, ok: (reply: T) => boolean, resolve: (reply: T) => void): (reply: T) => void {
  let left = count;
  let done = false;
  return (reply) => {
    if (done) return;
    left--;
    if (ok(reply) || left <= 0) {
      done = true;
      resolve(reply);
    }
  };
}

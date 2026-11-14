// ブラウザからこの Mac の画面として入る、一度だけ使えるログイン（npm run daemon が端末に出す URL。前の /pair?token= の代わり）。
// URL に本体のトークンは入れず、使い捨ての番号と引き換えに本体のトークンの Cookie を置く（Mac のアプリの画面は Cookie を最初から持つので使わない）
import { randomBytes } from "node:crypto";

/** 番号が使える時間 */
const LOGIN_TTL_MS = 5 * 60_000;

export class BrowserLogin {
  private readonly codes = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** 新しい番号を出す（一度だけ・5 分） */
  issue(): string {
    const code = randomBytes(24).toString("base64url");
    this.codes.set(code, this.now() + LOGIN_TTL_MS);
    return code;
  }

  /** 番号を使う（使えたか。使ったら消す） */
  consume(code: string): boolean {
    const until = this.codes.get(code);
    this.codes.delete(code);
    for (const [c, t] of this.codes) if (t <= this.now()) this.codes.delete(c);
    return until !== undefined && until > this.now();
  }
}

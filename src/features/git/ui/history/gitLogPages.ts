import type { GitCommit, GitLog } from "@shared/git/types";

/**
 * 読み込んだ範囲（コミットの数。0 なら 1 ページ）を、先頭から 1 ページずつ読み直す。
 * 取り直しで先頭のページが変わっても、続きを古い位置から足さないよう、範囲ごと読む
 */
export async function readLogRange(readPage: (skip: number) => Promise<GitLog>, count: number): Promise<GitLog> {
  let log: GitLog = { commits: [], more: false };
  do {
    const page = await readPage(log.commits.length);
    log = { commits: [...log.commits, ...page.commits], more: page.more };
    if (page.commits.length === 0) break;
  } while (log.more && log.commits.length < count);
  return log;
}

/** 続きのページを足す。読み始めたときの一覧（base）から取り直しで変わっていれば足さない（古い位置からの続きは重なる・抜ける） */
export function appendPage(current: GitLog, base: GitLog, page: GitLog): GitLog {
  return current === base ? { commits: [...current.commits, ...page.commits], more: page.more } : current;
}

/** 描き直しが要るかを比べるための、コミットとその印 */
const keyOf = (c: GitCommit) => `${c.hash}:${c.refs.join("|")}`;

/** 取り直した一覧が前の一覧の先頭と同じなら同じ（前の一覧のまま。読み込んだ続きも残す） */
export const sameLogStart = (prev: GitLog, next: GitLog): boolean => prev.commits.slice(0, next.commits.length).map(keyOf).join() === next.commits.map(keyOf).join();

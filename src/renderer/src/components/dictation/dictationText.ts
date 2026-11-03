// 音声入力の補助（純粋関数）: 起こした文を入力欄に入れる位置と、マイクの失敗の文
import { CJK_CHAR } from "../../../../core/types";
import { errorMessage } from "../../errors";

/** a の終わりと b の始まりの間に入れる空白（どちらかが空白・改行・空なら何も入れない。日本語どうしも詰める） */
function glue(a: string, b: string): string {
  const last = a.at(-1);
  const first = b[0];
  if (!last || !first || /\s/.test(last) || /\s/.test(first)) return "";
  return CJK_CHAR.test(last) && CJK_CHAR.test(first) ? "" : " ";
}

/**
 * 起こした文を、入力欄のキャレット（選んでいればその範囲を置き換えて）に入れる。
 * 前後の文とくっつくときだけ空白を補う。caret は入れた文の終わり
 */
export function insertDictation(value: string, start: number, end: number, inserted: string): { text: string; caret: number } {
  const body = inserted.trim();
  if (!body) return { text: value, caret: end };
  const before = value.slice(0, start);
  const after = value.slice(end);
  const head = before + glue(before, body) + body;
  return { text: head + glue(body, after) + after, caret: head.length };
}

/** マイクを使い始められなかったときの文（getUserMedia の例外の名前ごと） */
export function micErrorMessage(e: unknown): string {
  const name = (e as { name?: unknown } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "マイクの使用が許可されていません。システム設定 → プライバシーとセキュリティ → マイク で Kickoff を許可してください。";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "マイクが見つかりません。マイクをつないでから、もう一度押してください。";
  if (name === "NotReadableError") return "マイクを使えません（ほかのアプリが使っている可能性があります）。";
  return `録音を始められません: ${errorMessage(e)}`;
}

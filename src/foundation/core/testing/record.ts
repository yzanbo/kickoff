// 網の記録（AI に見せるもの・ルート・スキーマ・SSE の種類・守りの答えを固定するファイル）を比べる補助。テストからだけ使う。
// テストのファイルは expect を読まず、ここの matchRecord を通す（expect を使うのはこのファイルだけ）
import fs from "node:fs";
import os from "node:os";
import { expect } from "vitest";

/**
 * 値を記録のファイルと比べる（なければ書く。違えば落ちる。直すときは npx vitest run <ファイル> --update。--update を前に書くと、次の引数を更新の種類として読み、全部のテストを流す）。
 * file はテストのファイルからの相対パス（`__snapshots__/<名前>`）。文字ならそのまま、ほかは 2 字下げの JSON（最後に改行）にして比べる。
 * 記録が変わる変更は、記録の更新を同じコミットに含める（差分で、AI・端末・DB に見える変化を見せる）
 */
export async function matchRecord(file: string, value: unknown): Promise<void> {
  const text = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  await expect(text).toMatchFileSnapshot(file);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 一時フォルダ（os.tmpdir() と、そのシンボリックリンクを解いたパス）と、その中の最初のフォルダ（mkdtemp の毎回違う名前） */
function tmpPattern(): RegExp {
  const roots = [...new Set([os.tmpdir(), fs.realpathSync(os.tmpdir())])].sort((a, b) => b.length - a.length);
  return new RegExp(`(?:${roots.map(escapeRegExp).join("|")})(?:/[^/\\s"'\`]+)?`, "g");
}

const TIME = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const KEY_LIKE = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{24,}(?![A-Za-z0-9_-])/g;

/**
 * 毎回変わる値を伏せる: paths で渡したパス → "<名前>"、一時フォルダ（とその中の最初のフォルダ）→ "<TMP>"、
 * ISO の時刻 → "<TIME>"、UUID → "<UUID>"、英字と数字が混ざった 24 字以上の [A-Za-z0-9_-] の並び（鍵らしいもの）→ "<KEY>"。
 * 値は深くたどり、文字だけを置き換える（キーは変えない）
 */
export function maskVolatile<T>(value: T, opts: { paths?: Record<string, string> } = {}): T {
  // 長いパスから置き換える（短いほうが長いほうの一部のとき、先に短いほうを当てない）
  const named = Object.entries(opts.paths ?? {}).sort(([, a], [, b]) => b.length - a.length);
  const tmp = tmpPattern();
  const maskText = (text: string): string => {
    let out = text;
    for (const [name, p] of named) out = out.split(p).join(`<${name}>`);
    return out
      .replace(tmp, "<TMP>")
      .replace(TIME, "<TIME>")
      .replace(UUID, "<UUID>")
      .replace(KEY_LIKE, (s) => (/[A-Za-z]/.test(s) && /\d/.test(s) ? "<KEY>" : s));
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return maskText(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

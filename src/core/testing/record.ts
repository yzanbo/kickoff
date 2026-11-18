// 網の記録（作り直しの前の振る舞いを固定する test-records/ のファイル）を比べる補助。テストからだけ使う。
// テストのファイルは expect を読まず、ここの matchRecord を通す（expect を使うのはこのファイルだけ）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "vitest";

/** 記録の置き場所（リポジトリの直下の test-records。テストはリポジトリの直下で流す） */
export const RECORDS_DIR = path.resolve("test-records");

/**
 * 値を test-records/<name> の記録と比べる（なければ書く。違えば落ちる。直すときは npx vitest run --update <ファイル>）。
 * 文字ならそのまま、ほかは 2 字下げの JSON（最後に改行）にして比べる
 */
export async function matchRecord(name: string, value: unknown): Promise<void> {
  const text = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  await expect(text).toMatchFileSnapshot(path.join(RECORDS_DIR, name));
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

/** 値の形（文字は型の名前、配列は要素の形を重ねた 1 要素の配列、オブジェクトはキーごとの形） */
export type Shape = string | Shape[] | { [key: string]: Shape };

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** いくつかの値（同じ場所に現れる別々の値）の形を 1 つに重ねる */
function shapeOfAll(values: readonly unknown[]): Shape {
  const primitives = new Set<string>();
  const arrays: unknown[][] = [];
  const objects: Record<string, unknown>[] = [];
  for (const v of values) {
    if (v === null) primitives.add("null");
    else if (Array.isArray(v)) arrays.push(v);
    else if (typeof v === "object") objects.push(v as Record<string, unknown>);
    else primitives.add(typeof v);
  }
  const alternatives: Shape[] = [...primitives].sort(byKey);
  if (arrays.length > 0) {
    const items = arrays.flat();
    alternatives.push(items.length > 0 ? [shapeOfAll(items)] : []);
  }
  if (objects.length > 0) {
    const keys = [...new Set(objects.flatMap((o) => Object.keys(o)))].sort(byKey);
    const shape: Record<string, Shape> = {};
    for (const key of keys) {
      const having = objects.filter((o) => Object.hasOwn(o, key));
      // いくつかの要素にしかないキーは「?」を付ける
      shape[having.length === objects.length ? key : `${key}?`] = shapeOfAll(having.map((o) => o[key]));
    }
    alternatives.push(shape);
  }
  if (alternatives.length === 1) return alternatives[0];
  // 種類の違う形が重なったら "A | B"（配列・オブジェクトの形は JSON の文字にして並べる）
  return alternatives
    .map((s) => (typeof s === "string" ? s : JSON.stringify(s)))
    .sort(byKey)
    .join(" | ");
}

/**
 * 値の「形」だけを取り出す（応答の形の記録）: 文字 → "string"、数 → "number"、真偽 → "boolean"、null → "null"、
 * 配列 → 要素の形を重ねた 1 要素の配列（空なら []）、オブジェクト → キーを並べ替えた形（いくつかの要素にしかないキーは "キー?"）。
 * 同じ場所で形が違う値は "A | B" にまとめる
 */
export function shapeOf(value: unknown): Shape {
  return shapeOfAll([value]);
}

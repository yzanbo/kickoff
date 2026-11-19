// メモの AI の、AI に送る文と答えの読み方（純粋関数）: フォルダの整理案（案を返すだけで、メモは動かさない。動かすかは画面で決める）と、
// 既存のメモにチャットの文を取り込んだまとめ直し
import path from "node:path";
import type { MemoEntry, MemoPlan, MemoPlanMove } from "@shared/types";

/** 整理案を作るときに見せるメモの数・1 つのメモの書き出しの長さ・整理案の数の上限 */
const MAX_PLAN_FILES = 300;
const PLAN_HEAD_CHARS = 200;
const MAX_PLAN_MOVES = 100;

/** 整理案を作るときに見せるメモ（パスと書き出し） */
export interface PlanFile {
  path: string;
  head: string;
}

/** メモのフォルダの整理案を作ってもらう文（JSON で答えてもらう） */
export function memoPlanPrompt(files: readonly PlanFile[], dirs: readonly string[], instruction: string | null): string {
  // パスは JSON の文字列で示す（空白・「:」・「,」を含む名前でも、どこまでがパスか分かるように）
  const listed = files.slice(0, MAX_PLAN_FILES).map((f) => `- ${JSON.stringify(f.path)}: ${f.head.replace(/\s+/g, " ").slice(0, PLAN_HEAD_CHARS)}`);
  return [
    "次のメモのフォルダを、あとで探しやすいように整理する案を作ってください。できるのは、メモの名前の変更と、ほかのフォルダへの移動だけです（新しいフォルダは行き先に書けば作られます）。",
    "",
    `頼み: ${instruction?.trim() || "内容の近いメモを同じフォルダにまとめ、分かりにくい名前は内容の分かる名前にする"}`,
    "",
    "守ること:",
    "- パスは下の一覧のように \"\" で囲んで示す（空白も名前のうち）。from は一覧にあるメモのパスをそのまま書く。to はメモのフォルダからの相対パスで、拡張子は元のまま。",
    "- 消す・中身を書き換える案は出さない。いまのままでよいメモは出さない。",
    "- 名前とフォルダ名は内容の言語で、短く分かりやすく。",
    `- 案は ${MAX_PLAN_MOVES} 件まで。整理する必要がなければ moves は空にする。`,
    '- 答えは次の形の JSON だけ（前置き・説明・``` は書かない）: {"moves":[{"from":"いまのパス","to":"新しいパス","reason":"短い理由"}]}',
    "",
    `いまのフォルダ: ${dirs.length > 0 ? dirs.map((d) => JSON.stringify(d)).join(", ") : "（なし）"}`,
    "メモ（パス: 書き出し）:",
    ...listed,
  ].join("\n");
}

/** 行き先のパスを整える（区切りをそろえ、頭の「./」「/」と各段の前後の空白を外す）。使えない形（空・「.」で始まる部分・「..」）なら null */
function cleanTarget(to: string): string | null {
  const parts = to.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "").split("/").map((p) => p.trim());
  if (parts.some((p) => p === "" || p.startsWith("."))) return null;
  return parts.join("/");
}

/**
 * AI の答えから整理案を読む（JSON の部分を取り出し、使える案だけを残す）。使えないもの: 一覧にないメモ・行き先が使えない形・拡張子が変わる・
 * 行き先に同じ名前のメモ・フォルダがある（大文字・小文字だけを変えるときは除く）・同じメモや同じ行き先が重なる。行き先に拡張子がなければ元のものを足す
 */
export function parseMemoPlan(answer: string, entries: readonly Pick<MemoEntry, "path" | "dir">[]): MemoPlan {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  let raw: unknown;
  try {
    raw = start >= 0 && end > start ? JSON.parse(answer.slice(start, end + 1)) : null;
  } catch {
    raw = null;
  }
  const list = raw && typeof raw === "object" && Array.isArray((raw as { moves?: unknown }).moves) ? ((raw as { moves: unknown[] }).moves) : [];
  const files = new Set(entries.filter((e) => !e.dir).map((e) => e.path));
  const taken = new Set(entries.map((e) => e.path.toLowerCase()));
  const froms = new Set<string>();
  const targets = new Set<string>();
  const moves: MemoPlanMove[] = [];
  let skipped = 0;
  for (const item of list) {
    const { from, to, reason } = (item ?? {}) as { from?: unknown; to?: unknown; reason?: unknown };
    if (typeof from !== "string" || typeof to !== "string" || !files.has(from) || froms.has(from) || moves.length >= MAX_PLAN_MOVES) {
      skipped++;
      continue;
    }
    let target = cleanTarget(to);
    const ext = path.extname(from);
    if (target && ext && !path.extname(target)) target += ext;
    const caseOnly = target !== null && target !== from && target.toLowerCase() === from.toLowerCase();
    if (!target || target === from || path.extname(target) !== ext || (taken.has(target.toLowerCase()) && !caseOnly) || targets.has(target.toLowerCase())) {
      skipped++;
      continue;
    }
    froms.add(from);
    targets.add(target.toLowerCase());
    moves.push({ from, to: target, reason: typeof reason === "string" ? reason.trim().slice(0, 200) : "" });
  }
  return { moves, skipped };
}

/**
 * 既存のメモと、チャットから持ってきた文を 1 つのメモにまとめ直してもらう文（答えはメモの全体の Markdown）。
 * source はどのチャットの、いつの文か（`memoSourceLine`）
 */
export function memoMergePrompt(current: string, addition: string, source: string): string {
  return [
    "次の「いまのメモ」に「足す文」の内容を取り込み、1 つのメモとしてまとめ直してください。",
    "",
    "守ること:",
    "- いまのメモにある情報は落とさない。重なる内容は 1 か所にまとめ、足す文の新しい内容は関係する見出しの下に入れる（合う見出しがなければ足す）。",
    "- いちばん上の見出し（題名）は変えない。言語・書き方（Markdown）・調子はいまのメモにそろえる。",
    "- 長い説明は要点に縮めてよいが、コード・コマンド・パス・数値・URL はそのまま残す。",
    "- 答えはまとめ直したメモの全体の Markdown だけ（前置き・説明・メモ全体を囲む ``` は書かない）。",
    "",
    "<いまのメモ>",
    current.trim(),
    "</いまのメモ>",
    "",
    `<足す文 出どころ="${source.replace(/^>\s*/, "").replace(/"/g, "'")}">`,
    addition.trim(),
    "</足す文>",
  ].join("\n");
}

/** まとめ直したメモの答えを読む（全体を ``` で囲んでいれば外す。前後の空白を削り、最後に改行を 1 つ。空なら null） */
export function parseMergedMemo(answer: string): string | null {
  const trimmed = answer.trim();
  const fenced = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/.exec(trimmed);
  const body = (fenced ? fenced[1] : trimmed).trim();
  return body ? `${body}\n` : null;
}

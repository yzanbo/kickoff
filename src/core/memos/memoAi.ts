// メモの AI の整理（内容を直す・フォルダの整理案を作る）の、AI に送る文と、答えの読み方（純粋関数）。
// どちらも提案を返すだけで、メモは書き換えない（取り込む・動かすかは画面で決める）
import path from "node:path";
import type { MemoEntry, MemoPlan, MemoPlanMove } from "@shared/types";

/** AI に渡すメモの文の上限（文字） */
export const MAX_MEMO_AI_CHARS = 60_000;

/** 整理案を作るときに見せるメモの数・1 つのメモの書き出しの長さ・整理案の数の上限 */
const MAX_PLAN_FILES = 300;
const PLAN_HEAD_CHARS = 200;
const MAX_PLAN_MOVES = 100;

/** メモ（または選んだ部分）を、頼みに沿って書き直してもらう文 */
export function memoEditPrompt(text: string, instruction: string, part: boolean): string {
  const target = part ? "メモの一部（選んだ部分）" : "メモ";
  const rules = [
    "書いてあることだけを使い、書いていない事実・推測・助言は足さない。",
    "頼みに関係のない内容は消さない（短くする・まとめる頼みのときを除く）。",
    "リンク・コード・ファイル名・コマンド・数値はそのまま残す。",
    "元の言語のまま書く。",
    ...(part ? ["前後の文につながるよう、見出しの深さや箇条書きの形は元に合わせる。"] : []),
    `書き直した${part ? "部分" : "メモ"}だけを出力する。前置き・説明・「以下は〜です」の文は書かず、全体を \`\`\` で囲まない。`,
  ];
  return [
    `次の「---」より後ろの Markdown の${target}を、頼みに沿って書き直してください。`,
    "",
    `頼み: ${instruction.trim()}`,
    "",
    "守ること:",
    ...rules.map((r) => `- ${r}`),
    "",
    "---",
    text.slice(0, MAX_MEMO_AI_CHARS),
  ].join("\n");
}

/** 答えの全体が ``` で囲まれていたら外す（言われても囲んでくることがある） */
export function unwrapFence(answer: string): string {
  const m = answer.trim().match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  return m ? m[1] : answer.trim();
}

/** 整理案を作るときに見せるメモ（パスと書き出し） */
export interface PlanFile {
  path: string;
  head: string;
}

/** メモのフォルダの整理案を作ってもらう文（JSON で答えてもらう） */
export function memoPlanPrompt(files: readonly PlanFile[], dirs: readonly string[], instruction: string | null): string {
  const listed = files.slice(0, MAX_PLAN_FILES).map((f) => `- ${f.path}: ${f.head.replace(/\s+/g, " ").slice(0, PLAN_HEAD_CHARS)}`);
  return [
    "次のメモのフォルダを、あとで探しやすいように整理する案を作ってください。できるのは、メモの名前の変更と、ほかのフォルダへの移動だけです（新しいフォルダは行き先に書けば作られます）。",
    "",
    `頼み: ${instruction?.trim() || "内容の近いメモを同じフォルダにまとめ、分かりにくい名前は内容の分かる名前にする"}`,
    "",
    "守ること:",
    "- from は下の一覧にあるメモのパスをそのまま書く。to はメモのフォルダからの相対パスで、拡張子は元のまま。",
    "- 消す・中身を書き換える案は出さない。いまのままでよいメモは出さない。",
    "- 名前とフォルダ名は内容の言語で、短く分かりやすく。",
    `- 案は ${MAX_PLAN_MOVES} 件まで。整理する必要がなければ moves は空にする。`,
    '- 答えは次の形の JSON だけ（前置き・説明・``` は書かない）: {"moves":[{"from":"いまのパス","to":"新しいパス","reason":"短い理由"}]}',
    "",
    `いまのフォルダ: ${dirs.length > 0 ? dirs.join(", ") : "（なし）"}`,
    "メモ（パス: 書き出し）:",
    ...listed,
  ].join("\n");
}

/** 行き先のパスを整える（区切りをそろえ、頭の「./」「/」を外す）。使えない形（空・「.」で始まる部分・「..」）なら null */
function cleanTarget(to: string): string | null {
  const parts = to.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "").split("/");
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

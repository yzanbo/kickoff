// メモの AI（メモについての会話・フォルダの整理案）の、AI に送る文と、答えの読み方（純粋関数）。
// どちらも提案を返すだけで、メモは書き換えない（取り込む・動かすかは画面で決める）
import path from "node:path";
import type { MemoChatReply, MemoChatTurn, MemoEntry, MemoPlan, MemoPlanMove } from "@shared/types";

/** AI に渡すメモの文の上限（文字） */
export const MAX_MEMO_AI_CHARS = 60_000;

/** 整理案を作るときに見せるメモの数・1 つのメモの書き出しの長さ・整理案の数の上限 */
const MAX_PLAN_FILES = 300;
const PLAN_HEAD_CHARS = 200;
const MAX_PLAN_MOVES = 100;

/** 会話で AI に渡す、選んだ部分・これまでの会話の上限（文字。会話は新しいものから残す） */
const MAX_SELECTION_CHARS = 20_000;
const MAX_HISTORY_CHARS = 30_000;

/** 変更の案を囲む印（返事の最後に付けてもらう） */
const EDIT_OPEN = /<memo-edit\s+target="(selection|memo)"\s*>/g;
const EDIT_CLOSE = "</memo-edit>";

/**
 * メモについての会話の文: いまのメモ・選んだ部分（話の的）・これまでの会話（古いものは上限で落とす）。
 * 返事はふつうの文で、メモを変える案が固まったとき（書き込み・反映を頼まれたとき）だけ、最後に変えたあとの文を <memo-edit> で囲んで付けてもらう
 */
export function memoChatPrompt(messages: readonly MemoChatTurn[], memo: string, selection: string | null): string {
  const history: string[] = [];
  let used = 0;
  for (const m of [...messages].reverse()) {
    const line = `${m.role === "user" ? "利用者" : "AI"}: ${m.text}`;
    if (history.length > 0 && used + line.length > MAX_HISTORY_CHARS) break;
    history.unshift(line);
    used += line.length;
  }
  const target = selection ? "selection" : "memo";
  return [
    "あなたは、利用者と話しながら 1 つのメモ（Markdown）を作り上げる相手です。利用者の最後の発言に、日本語で短く要点から答えてください。",
    "",
    "守ること:",
    "- 相談・質問・アイデア出しには、ふつうの文で答える（メモはまだ変えない）。",
    `- メモを変える案が固まったとき（「直して」「反映して」「メモにまとめて」などと頼まれたとき）だけ、返事の最後に、変えたあとの文を <memo-edit target="${target}"> と </memo-edit> で囲んで 1 つだけ付ける。`,
    `- ${selection ? "選んだ部分があるので、memo-edit の中は選んだ部分を置き換える文だけにする（前後の文とつながるように）。" : "memo-edit の中は、そのまま置き換えられるメモ全体の文にする（変えない部分も省かない）。"}`,
    "- memo-edit の外では、変えた点を短く説明する。memo-edit の中を ``` で囲まない。",
    "- 会話で決めたことは足してよいが、話に出ていない事実は足さない。リンク・コード・ファイル名・数値はそのまま残す。",
    "",
    "# いまのメモ（<memo> と </memo> の間。この印は memo-edit に写さない）",
    "<memo>",
    memo.slice(0, MAX_MEMO_AI_CHARS) || "（まだ空）",
    "</memo>",
    ...(selection ? ["", "# 選んだ部分（ここについての話。<selection> と </selection> の間）", "<selection>", selection.slice(0, MAX_SELECTION_CHARS), "</selection>"] : []),
    "",
    "# これまでの会話（最後が今回の発言）",
    ...history,
  ].join("\n");
}

/** 返事を、見せる文と変更の案に分ける（案は最後の <memo-edit> だけ。閉じていなければ最後まで。案の外の文は前後の空白を詰める） */
export function parseMemoChatReply(answer: string): MemoChatReply {
  const opens = [...answer.matchAll(EDIT_OPEN)];
  const last = opens.at(-1);
  if (!last || last.index === undefined) return { reply: answer.trim(), edit: null };
  const start = last.index + last[0].length;
  const close = answer.indexOf(EDIT_CLOSE, start);
  const inner = answer.slice(start, close < 0 ? undefined : close);
  const after = close < 0 ? "" : answer.slice(close + EDIT_CLOSE.length);
  const reply = `${answer.slice(0, last.index)}${after}`.trim();
  const text = unwrapFence(inner.replace(/^\n+|\n+$/g, ""));
  return { reply, edit: text.trim() ? { target: last[1] as "selection" | "memo", text } : null };
}

/**
 * 案の文が、元の文（メモ・選んだ部分）にない囲み（頭と末尾の「---」の行・<memo> / <selection> の印）で包まれていたら外す
 * （メモを区切った印まで写してくることがある）。元の文も同じ形で始まっていれば、そのまま
 */
export function stripEchoedFrame(text: string, original: string): string {
  for (const [open, close] of [["---", "---"], ["<memo>", "</memo>"], ["<selection>", "</selection>"]]) {
    const lines = text.split("\n");
    if (lines.length >= 2 && lines[0].trim() === open && lines.at(-1)?.trim() === close && original.trimStart().split("\n")[0].trim() !== open) {
      return lines.slice(1, -1).join("\n").replace(/^\n+|\n+$/g, "");
    }
  }
  return text;
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

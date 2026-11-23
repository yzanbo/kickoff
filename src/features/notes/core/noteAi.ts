// ノートの AI: チャットの文からノートを作る・足す（要約・既存のノートとのまとめ直し）と、フォルダの整理案（案を返すだけで、ノートは動かさない。動かすかは画面で決める）。
// AI に送る文と答えの読み方は純粋関数（テストは noteAi.test.ts）
import fs from "node:fs/promises";
import path from "node:path";
import { noteKindOf } from "@shared/notes/kinds";
import { chatNoteName } from "@shared/notes/names";
import { UNTITLED_CHAT_TITLE, type Chat } from "@shared/chat/types";
import { NOTE_EXTENSION, type NoteEntry, type NotePlan, type NotePlanMove, type NoteRef } from "@shared/notes/types";
import type { Project } from "@shared/projects/types";
import type { ProviderId } from "@shared/settings/types";
import { asInvalid, Invalid } from "@/foundation/core/errors";
import { askSummary, canAsk, type AgentProvider } from "@/features/ai/core/index";
import type { NoteService } from "./service";

/** チャットから作るノートの元の文の上限（文字） */
export const MAX_NOTE_SOURCE_CHARS = 200_000;

/** 整理案を作るときに見せるノートの数・1 つのノートの書き出しの長さ・整理案の数の上限 */
const MAX_PLAN_FILES = 300;
const PLAN_HEAD_CHARS = 200;
const MAX_PLAN_MOVES = 100;

/** 整理案を作るときに見せるノート（パスと書き出し） */
export interface PlanFile {
  path: string;
  head: string;
}

/** ノートのフォルダの整理案を作ってもらう文（JSON で答えてもらう） */
export function notePlanPrompt(files: readonly PlanFile[], dirs: readonly string[], instruction: string | null): string {
  // パスは JSON の文字列で示す（空白・「:」・「,」を含む名前でも、どこまでがパスか分かるように）
  const listed = files.slice(0, MAX_PLAN_FILES).map((f) => `- ${JSON.stringify(f.path)}: ${f.head.replace(/\s+/g, " ").slice(0, PLAN_HEAD_CHARS)}`);
  return [
    "次のノートのフォルダを、あとで探しやすいように整理する案を作ってください。できるのは、ノートの名前の変更と、ほかのフォルダへの移動だけです（新しいフォルダは行き先に書けば作られます）。",
    "",
    `頼み: ${instruction?.trim() || "内容の近いノートを同じフォルダにまとめ、分かりにくい名前は内容の分かる名前にする"}`,
    "",
    "守ること:",
    "- パスは下の一覧のように \"\" で囲んで示す（空白も名前のうち）。from は一覧にあるノートのパスをそのまま書く。to はノートのフォルダからの相対パスで、拡張子は元のまま。",
    "- 消す・中身を書き換える案は出さない。いまのままでよいノートは出さない。",
    "- 名前とフォルダ名は内容の言語で、短く分かりやすく。",
    `- 案は ${MAX_PLAN_MOVES} 件まで。整理する必要がなければ moves は空にする。`,
    '- 答えは次の形の JSON だけ（前置き・説明・``` は書かない）: {"moves":[{"from":"いまのパス","to":"新しいパス","reason":"短い理由"}]}',
    "",
    `いまのフォルダ: ${dirs.length > 0 ? dirs.map((d) => JSON.stringify(d)).join(", ") : "（なし）"}`,
    "ノート（パス: 書き出し）:",
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
 * AI の答えから整理案を読む（JSON の部分を取り出し、使える案だけを残す）。使えないもの: 一覧にないノート・行き先が使えない形・拡張子が変わる・
 * 行き先に同じ名前のノート・フォルダがある（大文字・小文字だけを変えるときは除く）・同じノートや同じ行き先が重なる。行き先に拡張子がなければ元のものを足す
 */
export function parseNotePlan(answer: string, entries: readonly Pick<NoteEntry, "path" | "dir">[]): NotePlan {
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
  const moves: NotePlanMove[] = [];
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
 * 既存のノートと、チャットから持ってきた文を 1 つのノートにまとめ直してもらう文（答えはノートの全体の Markdown）。
 * source はどのチャットの、いつの文か（`noteSourceLine`）
 */
export function noteMergePrompt(current: string, addition: string, source: string): string {
  return [
    "次の「いまのノート」に「足す文」の内容を取り込み、1 つのノートとしてまとめ直してください。",
    "",
    "守ること:",
    "- いまのノートにある情報は落とさない。重なる内容は 1 か所にまとめ、足す文の新しい内容は関係する見出しの下に入れる（合う見出しがなければ足す）。",
    "- いちばん上の見出し（題名）は変えない。言語・書き方（Markdown）・調子はいまのノートにそろえる。",
    "- 長い説明は要点に縮めてよいが、コード・コマンド・パス・数値・URL はそのまま残す。",
    "- 答えはまとめ直したノートの全体の Markdown だけ（前置き・説明・ノート全体を囲む ``` は書かない）。",
    "",
    "<いまのノート>",
    current.trim(),
    "</いまのノート>",
    "",
    `<足す文 出どころ="${source.replace(/^>\s*/, "").replace(/"/g, "'")}">`,
    addition.trim(),
    "</足す文>",
  ].join("\n");
}

/** まとめ直したノートの答えを読む（全体を ``` で囲んでいれば外す。前後の空白を削り、最後に改行を 1 つ。空なら null） */
export function parseMergedNote(answer: string): string | null {
  const trimmed = answer.trim();
  const fenced = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/.exec(trimmed);
  const body = (fenced ? fenced[1] : trimmed).trim();
  return body ? `${body}\n` : null;
}

/** チャットから作る・足すときに、文の前に置く出どころの行（どのチャットの、いつの文か） */
export function noteSourceLine(chat: Chat, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return `> チャット「${chat.title || UNTITLED_CHAT_TITLE}」から（${time}）`;
}

/** ノートの AI（プロジェクトのプロバイダーに聞く。対応していない・答えがなければ 400） */
export function createNoteAi(d: { notes: Pick<NoteService, "list" | "read" | "write" | "create">; providers: Record<ProviderId, AgentProvider> }) {
  /** 1 回だけ聞く（質が要るので sonnet） */
  const ask = async (project: Project, prompt: string): Promise<string> => {
    const provider = d.providers[project.provider];
    if (!provider?.ask) throw new Invalid("このプロジェクトの AI は、ノートの整理・まとめに対応していません");
    const answer = await provider.ask(prompt, { model: "standard" }).catch(asInvalid);
    if (!answer.trim()) throw new Invalid("AI から答えがありませんでした");
    return answer;
  };
  const summarize = async (project: Project, text: string): Promise<string> => {
    const provider = d.providers[project.provider];
    if (!canAsk(provider)) throw new Invalid("このプロジェクトの AI は、要約に対応していません");
    const summary = await askSummary(provider, text).catch(asInvalid);
    if (!summary) throw new Invalid("要約できませんでした");
    return summary;
  };
  return {
    /**
     * チャットの文からノートを作る・足す。summarize なら要約してから。appendTo があれば、そのノートの最後に区切り線を挟んで足す
     * （merge なら、AI がそのノートと合わせてノート全体をまとめ直して書き換える）。なければ folder（null なら直下）に「<チャット名> チャットノート<n>.md」を作る
     */
    async fromChat(project: Project, chat: Chat, input: { text: string; summarize: boolean; merge: boolean; appendTo: string | null; folder: string | null }): Promise<NoteRef> {
      if (input.merge && !input.appendTo) throw new Invalid("組み込むノートを選んでください");
      const source = noteSourceLine(chat, new Date());
      const body = input.summarize && !input.merge ? await summarize(project, input.text) : input.text.trim();
      const block = `${source}\n\n${body}\n`;
      if (input.appendTo) {
        // HTML のノートの最後に Markdown の文を足すと、ページの外（</html> のあと）に出てしまうので足さない
        if (noteKindOf(input.appendTo) !== "markdown") throw new Invalid("HTML のノートには追記できません（Markdown のノートを選んでください）");
        const current = await d.notes.read(project, input.appendTo);
        if (current.binary || current.truncated) throw new Invalid("このノートには足せません（大きすぎるか、文字のファイルではありません）");
        const merged = input.merge ? parseMergedNote(await ask(project, noteMergePrompt(current.content, body, source))) : null;
        if (input.merge && !merged) throw new Invalid("AI がノートをまとめられませんでした");
        const content = merged ?? `${current.content.replace(/\s+$/, "")}\n\n---\n\n${block}`;
        await d.notes.write(project, input.appendTo, content, current.hash);
        return { path: input.appendTo };
      }
      const folder = input.folder ?? "";
      const { entries } = await d.notes.list(project);
      const names = entries
        .filter((e) => !e.dir && e.path.slice(0, Math.max(e.path.lastIndexOf("/"), 0)) === folder && e.path.endsWith(NOTE_EXTENSION))
        .map((e) => path.posix.basename(e.path, NOTE_EXTENSION));
      const name = chatNoteName(chat.title || UNTITLED_CHAT_TITLE, names);
      const file = folder ? `${folder}/${name}${NOTE_EXTENSION}` : `${name}${NOTE_EXTENSION}`;
      return d.notes.create(project, file, { dir: false, content: `# ${name}\n\n${block}` });
    },
    /** ノートのフォルダの整理案（名前の変更・移動。AI に一覧と書き出しを見せて作り、使える案だけを返す。動かしはしない） */
    async aiPlan(project: Project, instruction: string | null): Promise<NotePlan> {
      const list = await d.notes.list(project);
      const files = list.entries.filter((e) => !e.dir);
      if (files.length === 0) return { moves: [], skipped: 0 };
      const heads: PlanFile[] = await Promise.all(files.slice(0, MAX_PLAN_FILES).map(async (e) => ({ path: e.path, head: await readHead(path.join(list.dir, e.path)) })));
      const dirs = list.entries.filter((e) => e.dir).map((e) => e.path);
      return parseNotePlan(await ask(project, notePlanPrompt(heads, dirs, instruction)), list.entries);
    },
  };
}

/** ノートの書き出し（整理案を作るときに見せる。読めなければ空） */
async function readHead(file: string): Promise<string> {
  const handle = await fs.open(file, "r").catch(() => null);
  if (!handle) return "";
  try {
    const buf = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead).toString("utf8").replace(/\uFFFD+$/, "");
  } finally {
    await handle.close();
  }
}

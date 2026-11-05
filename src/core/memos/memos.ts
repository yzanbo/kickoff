// プロジェクトのメモ（保存先はプロジェクトの外。設定の memos_dir（なければ既定）の下の、プロジェクトごとのフォルダの Markdown）。
// パスはメモのフォルダからの相対で受け、フォルダの外を指さないか必ず確かめる（中身の読み書きはエディタのファイルと同じ readProjectFile / writeProjectFile）
import fs from "node:fs/promises";
import path from "node:path";
import { chatMemoName, safeMemoName, uniqueMemoName } from "@shared/memo/names";
import { MEMO_EXTENSION, UNTITLED_CHAT_TITLE, type BusEvent, type Chat, type FileContent, type MemoEntry, type MemoList, type MemoPlan, type MemoRef, type Project, type ProviderId, type SavedFile } from "@shared/types";
import type { Store } from "../db/store.js";
import { assertInside, readProjectFile, writeProjectFile } from "../git/index.js";
import { asInvalid, Conflict, Invalid, NotFound } from "../http/errors.js";
import type { AgentProvider } from "../providers/types.js";
import { runCommand } from "../system/exec.js";
import { expandHome } from "../system/paths.js";
import { memoEditPrompt, memoPlanPrompt, parseMemoPlan, unwrapFence, type PlanFile } from "./memoAi.js";

/** 一覧に出す数の上限（大きなフォルダを指しても重くならないように） */
const MAX_ENTRIES = 5000;

/** チャットから作るメモの元の文の上限（文字） */
export const MAX_MEMO_SOURCE_CHARS = 200_000;

interface MemoServiceOptions {
  store: Store;
  /** 設定の memos_dir が null のときの親フォルダ（製品版と開発版で別） */
  defaultDir: string;
  providers: Record<ProviderId, AgentProvider>;
  publish: (e: BusEvent) => void;
  /** ゴミ箱へ移す（テストでは差し替えて、本物のゴミ箱に入れない） */
  trash?: (file: string) => Promise<void>;
}

/** macOS のゴミ箱へ移す（/usr/bin/trash。Finder の「ゴミ箱に入れる」と同じで、元に戻せる） */
async function moveToTrash(file: string): Promise<void> {
  await runCommand("/usr/bin/trash", [file]);
}

/** チャットから作る・足すときに、文の前に置く出どころの行（どのチャットの、いつの文か） */
export function memoSourceLine(chat: Chat, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return `> チャット「${chat.title || UNTITLED_CHAT_TITLE}」から（${time}）`;
}

export class MemoService {
  readonly defaultDir: string;
  constructor(private readonly opts: MemoServiceOptions) {
    this.defaultDir = opts.defaultDir;
  }

  /** メモの親フォルダ（設定。なければ既定） */
  rootDir(): string {
    return expandHome(this.opts.store.settings.get().memos_dir ?? this.opts.defaultDir);
  }

  /**
   * プロジェクトのメモのフォルダ（このプロジェクトだけ別の場所にしていればそこ、なければ親フォルダの下のフォルダ）。
   * フォルダ名をまだ決めていなければ、プロジェクト名から決めて覚える（ほかのプロジェクトのフォルダ名とは重ねない）
   */
  dirOf(project: Project): string {
    if (project.memo_path) return expandHome(project.memo_path);
    let folder = project.memo_folder;
    if (!folder) {
      const taken = this.opts.store.projects
        .list()
        .filter((p) => p.id !== project.id && !p.memo_path)
        .flatMap((p) => (p.memo_folder ? [p.memo_folder] : []));
      folder = uniqueMemoName(safeMemoName(project.name), taken);
      this.opts.store.projects.update(project.id, { memo_folder: folder });
    }
    return path.join(this.rootDir(), folder);
  }

  /** フォルダとファイルの一覧（隠しファイル・リンクは除く。フォルダがまだなければ空） */
  async list(project: Project): Promise<MemoList> {
    const dir = this.dirOf(project);
    const exists = await isDirectory(dir);
    const entries: MemoEntry[] = [];
    let truncated = false;
    const walk = async (rel: string) => {
      const items = await fs.readdir(path.join(dir, rel), { withFileTypes: true });
      items.sort((a, b) => a.name.localeCompare(b.name, "ja"));
      for (const item of items) {
        if (item.name.startsWith(".") || !(item.isDirectory() || item.isFile())) continue;
        if (entries.length >= MAX_ENTRIES) {
          truncated = true;
          return;
        }
        const child = rel ? `${rel}/${item.name}` : item.name;
        const stat = await fs.stat(path.join(dir, child));
        entries.push({ path: child, dir: item.isDirectory(), modified_at: stat.mtime.toISOString() });
        if (item.isDirectory()) await walk(child);
      }
    };
    if (exists) await walk("");
    return { dir, exists, entries, truncated };
  }

  /** メモの中身（なければ 404） */
  async read(project: Project, file: string): Promise<FileContent> {
    return readProjectFile(await this.existingDir(project), file);
  }

  /** メモを保存する（開いたときの指紋 baseHash といまの中身が違えば 409。null なら上書き） */
  async write(project: Project, file: string, content: string, baseHash: string | null): Promise<SavedFile> {
    const saved = await writeProjectFile(await this.existingDir(project), file, content, baseHash);
    this.changed(project, file);
    return saved;
  }

  /** 新しいメモ・フォルダを作る（同じ名前があれば 409。途中のフォルダも作る） */
  async create(project: Project, file: string, kind: { dir: boolean; content?: string }): Promise<MemoRef> {
    const target = await this.pathIn(project, file, true);
    if (await exists(target)) throw new Conflict("同じ名前のメモ・フォルダがあります");
    if (kind.dir) {
      await fs.mkdir(target, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, kind.content ?? "", { flag: "wx" });
    }
    this.changed(project, file);
    return { path: file };
  }

  /** 名前を変える・ほかのフォルダへ動かす（行き先に同じ名前があれば 409） */
  async move(project: Project, from: string, to: string): Promise<MemoRef> {
    const source = await this.pathIn(project, from);
    const target = await this.pathIn(project, to);
    if (!(await exists(source))) throw new NotFound(`メモが見つかりません: ${from}`);
    if (isWithin(source, target)) throw new Invalid("フォルダを、その中へは動かせません");
    // 大文字・小文字だけを変えるときは、同じファイルを指すので行き先があっても動かす
    if (source.toLowerCase() !== target.toLowerCase() && (await exists(target))) throw new Conflict("行き先に同じ名前のメモ・フォルダがあります");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(source, target);
    this.changed(project, to);
    return { path: to };
  }

  /** ゴミ箱へ移す（Finder から戻せる） */
  async trash(project: Project, file: string): Promise<void> {
    const target = await this.pathIn(project, file);
    if (!(await exists(target))) throw new NotFound(`メモが見つかりません: ${file}`);
    await (this.opts.trash ?? moveToTrash)(target);
    this.changed(project, null);
  }

  /**
   * チャットの文からメモを作る・足す。summarize なら AI（プロジェクトのプロバイダー）で要約してから。
   * appendTo があれば、そのメモの最後に区切り線を挟んで足す。なければ folder（メモのフォルダからの相対。null なら直下）に
   * 「<チャット名> チャットメモ<n>.md」を作る
   */
  async fromChat(project: Project, chat: Chat, input: { text: string; summarize: boolean; appendTo: string | null; folder: string | null }): Promise<MemoRef> {
    const body = input.summarize ? await this.summarize(project, input.text) : input.text.trim();
    const block = `${memoSourceLine(chat, new Date())}\n\n${body}\n`;
    if (input.appendTo) {
      const current = await this.read(project, input.appendTo);
      if (current.binary || current.truncated) throw new Invalid("このメモには足せません（大きすぎるか、文字のファイルではありません）");
      const content = `${current.content.replace(/\s+$/, "")}\n\n---\n\n${block}`;
      await this.write(project, input.appendTo, content, current.hash);
      return { path: input.appendTo };
    }
    const folder = input.folder ?? "";
    const { entries } = await this.list(project);
    const names = entries
      .filter((e) => !e.dir && parentOf(e.path) === folder && e.path.endsWith(MEMO_EXTENSION))
      .map((e) => path.posix.basename(e.path, MEMO_EXTENSION));
    const name = chatMemoName(chat.title || UNTITLED_CHAT_TITLE, names);
    const file = folder ? `${folder}/${name}${MEMO_EXTENSION}` : `${name}${MEMO_EXTENSION}`;
    return this.create(project, file, { dir: false, content: `# ${name}\n\n${block}` });
  }

  /** メモ（part なら本文で選んだ部分）を、頼みに沿って AI で書き直した文（保存はしない。取り込むかは画面で決める） */
  async aiEdit(project: Project, input: { text: string; instruction: string; part: boolean }): Promise<string> {
    const answer = await this.ask(project, memoEditPrompt(input.text, input.instruction, input.part));
    return unwrapFence(answer);
  }

  /** メモのフォルダの整理案（名前の変更・移動。AI に一覧と書き出しを見せて作り、使える案だけを返す。動かしはしない） */
  async aiPlan(project: Project, instruction: string | null): Promise<MemoPlan> {
    const list = await this.list(project);
    const files = list.entries.filter((e) => !e.dir);
    if (files.length === 0) return { moves: [], skipped: 0 };
    const heads: PlanFile[] = await Promise.all(
      files.slice(0, 300).map(async (e) => ({ path: e.path, head: await readHead(path.join(list.dir, e.path)) })),
    );
    const dirs = list.entries.filter((e) => e.dir).map((e) => e.path);
    return parseMemoPlan(await this.ask(project, memoPlanPrompt(heads, dirs, instruction)), list.entries);
  }

  /** プロジェクトのプロバイダーに 1 回だけ聞く（質が要るので sonnet。対応していない・答えがなければ 400） */
  private async ask(project: Project, prompt: string): Promise<string> {
    const provider = this.opts.providers[project.provider];
    if (!provider?.ask) throw new Invalid("このプロジェクトの AI は、メモの整理に対応していません");
    const answer = await provider.ask(prompt, { model: "sonnet" }).catch(asInvalid);
    if (!answer.trim()) throw new Invalid("AI から答えがありませんでした");
    return answer;
  }

  /** プロジェクトのプロバイダーで要約する（対応していなければ 400） */
  private async summarize(project: Project, text: string): Promise<string> {
    const provider = this.opts.providers[project.provider];
    if (!provider?.summarize) throw new Invalid("このプロジェクトの AI は、要約に対応していません");
    const summary = await provider.summarize(text).catch(asInvalid);
    if (!summary) throw new Invalid("要約できませんでした");
    return summary;
  }

  /** メモのフォルダ（なければ 404） */
  private async existingDir(project: Project): Promise<string> {
    const dir = this.dirOf(project);
    if (!(await isDirectory(dir))) throw new NotFound("メモのフォルダがありません");
    return dir;
  }

  /**
   * メモのフォルダの中の絶対パス（外を指せば 400。フォルダそのものも指せない）。
   * 隠しファイル（「.」で始まる名前）は扱わない。create ならフォルダがなければ作る
   */
  private async pathIn(project: Project, file: string, create = false): Promise<string> {
    if (file.split("/").some((part) => part.startsWith("."))) throw new Invalid("「.」で始まる名前は使えません");
    const dir = this.dirOf(project);
    if (create) await fs.mkdir(dir, { recursive: true });
    else if (!(await isDirectory(dir))) throw new NotFound("メモのフォルダがありません");
    return assertInside(dir, file);
  }

  private changed(project: Project, file: string | null) {
    this.opts.publish({ type: "memos", project_id: project.id, path: file });
  }
}

/** 相対パスの親フォルダ（直下なら ""） */
function parentOf(file: string): string {
  const i = file.lastIndexOf("/");
  return i < 0 ? "" : file.slice(0, i);
}

/** target が dir の中か（dir 自身は含まない） */
function isWithin(dir: string, target: string): boolean {
  const rel = path.relative(dir, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function exists(file: string): Promise<boolean> {
  return fs.lstat(file).then(
    () => true,
    () => false,
  );
}

async function isDirectory(dir: string): Promise<boolean> {
  return fs.stat(dir).then(
    (s) => s.isDirectory(),
    () => false,
  );
}

/** メモの書き出し（整理案を作るときに見せる。読めなければ空） */
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

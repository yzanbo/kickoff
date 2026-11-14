// プロジェクトのメモ（保存先はプロジェクトの外。設定の memos_dir（なければ既定）の下の、プロジェクトごとのフォルダの Markdown）。
// パスはメモのフォルダからの相対で受け、フォルダの外を指さないか必ず確かめる（中身の読み書きはエディタのファイルと同じ readProjectFile / writeProjectFile）
import fs from "node:fs/promises";
import path from "node:path";
import { memoKindOf } from "@shared/memo/kinds";
import { chatMemoName, projectMemoFolder } from "@shared/memo/names";
import { MEMO_EXTENSION, UNTITLED_CHAT_TITLE, type BusEvent, type Chat, type FileContent, type MemoEntry, type MemoList, type MemoPlan, type MemoSearchResult, type MemoRef, type Project, type ProviderId, type SavedFile } from "@shared/types";
import type { TrashService } from "../trash/service.js";
import type { Store } from "../db/store.js";
import { assertInside, readProjectFile, writeProjectFile } from "../git/index.js";
import { asInvalid, Conflict, Invalid, NotFound } from "../http/errors.js";
import type { AgentProvider } from "../providers/types.js";
import { expandHome, realPathLoose } from "../system/paths.js";
import { memoMergePrompt, memoPlanPrompt, parseMergedMemo, parseMemoPlan, type PlanFile } from "./memoAi.js";
import { searchMemoTexts } from "./memoSearch.js";
import { MemoWatcher } from "./memoWatcher.js";

/** 一覧に出す数の上限（大きなフォルダを指しても重くならないように） */
const MAX_ENTRIES = 5000;

/** HTML のメモが読むファイル（CSS・画像・フォント）の大きさの上限（バイト） */
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

/** チャットから作るメモの元の文の上限（文字） */
export const MAX_MEMO_SOURCE_CHARS = 200_000;

interface MemoServiceOptions {
  store: Store;
  /** 設定の memos_dir が null のときの親フォルダ（製品版と開発版で別） */
  defaultDir: string;
  providers: Record<ProviderId, AgentProvider>;
  publish: (e: BusEvent) => void;
  /** Kickoff のゴミ箱（メモを「ゴミ箱に入れる」と 3 日取っておき、元に戻せる） */
  trashBin: Pick<TrashService, "putPath">;
  /** メモのチャット（フォルダならその中のメモのもの）を、メモと同じゴミ箱の行に入れる（trash/chatTrash.ts の trashMemoChats。なければ入れない） */
  trashMemoChats?: (projectId: number, memoPath: string, itemId: string) => void;
}

/** チャットから作る・足すときに、文の前に置く出どころの行（どのチャットの、いつの文か） */
export function memoSourceLine(chat: Chat, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return `> チャット「${chat.title || UNTITLED_CHAT_TITLE}」から（${time}）`;
}

export class MemoService {
  readonly defaultDir: string;
  // Kickoff の外（Finder・ほかのアプリ）での変更も知らせる見張り（消したプロジェクトのものは、次に変わったときにやめる）
  private readonly watcher = new MemoWatcher((projectId, file) => {
    if (!this.opts.store.projects.get(projectId)) this.watcher.stop(projectId);
    else this.opts.publish({ type: "memos", project_id: projectId, path: file });
  });
  constructor(private readonly opts: MemoServiceOptions) {
    this.defaultDir = opts.defaultDir;
  }

  /** 見張りをすべてやめる（コアを止めるとき） */
  close(): void {
    this.watcher.close();
  }

  /**
   * dir をメモのフォルダにしているプロジェクト（except を除く。まだメモのフォルダを決めていないプロジェクトは数えない。
   * ~ とリンクを解いた実体で比べる）。画面がほかのプロジェクトと被っていると知らせるのに使う（被っていても使える）
   */
  usersOf(dir: string, except?: number): Project[] {
    const target = realPathLoose(path.resolve(expandHome(dir)));
    const root = this.rootDir();
    return this.opts.store.projects.list().filter((p) => {
      if (p.id === except) return false;
      const own = p.memo_path ? expandHome(p.memo_path) : p.memo_folder ? path.join(root, p.memo_folder) : null;
      return own !== null && realPathLoose(path.resolve(own)) === target;
    });
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
      // ゴミ箱のプロジェクトのフォルダ名とも重ねない（戻したときに、2 つのプロジェクトが同じメモのフォルダを指さないように）
      folder = projectMemoFolder(project.name, [...this.opts.store.projects.list(), ...this.opts.store.projects.trashed()], project.id);
      this.opts.store.projects.update(project.id, { memo_folder: folder });
    }
    return path.join(this.rootDir(), folder);
  }

  /** フォルダとファイルの一覧（隠しファイル・リンクは除く。フォルダがまだなければ空） */
  async list(project: Project): Promise<MemoList> {
    const dir = this.dirOf(project);
    const exists = await isDirectory(dir);
    // 一覧を見ている間は、外での変更も知らせる（フォルダが変わったら見張り直す）
    if (exists) this.watcher.watch(project.id, dir);
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

  /**
   * すべてのプロジェクト（アーカイブしたものを除く）のメモの中の文を探す（⌘K の「メモ内の文言」）。
   * まだメモのフォルダを決めていないプロジェクトは探さない（探すだけでフォルダ名を決めないように）。同じフォルダを指すプロジェクトは 1 回だけ
   */
  async search(query: string): Promise<MemoSearchResult> {
    const seen = new Set<string>();
    const sources: { projectId: number; dir: string; files: string[] }[] = [];
    for (const project of this.opts.store.projects.list()) {
      if (project.archived_at || (!project.memo_path && !project.memo_folder)) continue;
      const real = realPathLoose(this.dirOf(project));
      if (seen.has(real)) continue;
      seen.add(real);
      const list = await this.list(project);
      if (list.exists) sources.push({ projectId: project.id, dir: list.dir, files: list.entries.filter((e) => !e.dir).map((e) => e.path) });
    }
    return searchMemoTexts(sources, query);
  }

  /** メモの中身（なければ 404） */
  async read(project: Project, file: string): Promise<FileContent> {
    const dir = await this.existingDir(project);
    this.watcher.watch(project.id, dir);
    return readProjectFile(dir, file);
  }

  /** メモのフォルダのファイルの中身そのもの（HTML のメモが相対パスで読む CSS・画像など。なければ 404・大きすぎれば 400） */
  async asset(project: Project, file: string): Promise<Buffer> {
    const dir = await this.existingDir(project);
    const target = await assertInside(dir, file);
    // リンクをたどった先も、メモのフォルダの中だけにする
    const real = await fs.realpath(target).catch(() => null);
    if (!real) throw new NotFound(`ファイルが見つかりません: ${file}`);
    if (!isWithin(await fs.realpath(dir), real)) throw new Invalid("メモのフォルダの外のファイルです");
    const stat = await fs.stat(real);
    if (!stat.isFile()) throw new NotFound(`ファイルが見つかりません: ${file}`);
    if (stat.size > MAX_ASSET_BYTES) throw new Invalid("大きすぎるので読み込みません");
    return fs.readFile(real);
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
    // メモのチャットも新しい名前へ付け替える（フォルダなら中のメモのものも）
    this.opts.store.chats.remapMemoPath(project.id, from, to);
    // DB の接続の手順メモも付け替える
    this.opts.store.dbConnections.remapMemoPath(project.id, from, to);
    this.changed(project, to);
    return { path: to };
  }

  /** Kickoff のゴミ箱へ入れる（3 日は元に戻せる）。入れたゴミ箱の ID を返す（画面の「元に戻す」） */
  async trash(project: Project, file: string): Promise<string> {
    const target = await this.pathIn(project, file);
    if (!(await exists(target))) throw new NotFound(`メモが見つかりません: ${file}`);
    const item = await this.opts.trashBin.putPath(target, { projectId: project.id, details: { memo: file } });
    // メモのチャットもメモと一緒にゴミ箱へ（一覧には 1 行。戻すと一緒に戻り、3 日たてば一緒に消える。作業中のものはそのまま）
    this.opts.trashMemoChats?.(project.id, file, item.id);
    this.changed(project, null);
    return item.id;
  }

  /**
   * チャットの文からメモを作る・足す。summarize なら AI（プロジェクトのプロバイダー）で要約してから。
   * appendTo があれば、そのメモの最後に区切り線を挟んで足す（merge なら、AI がそのメモと合わせてメモ全体をまとめ直して書き換える）。
   * なければ folder（メモのフォルダからの相対。null なら直下）に「<チャット名> チャットメモ<n>.md」を作る
   */
  async fromChat(
    project: Project,
    chat: Chat,
    input: { text: string; summarize: boolean; merge: boolean; appendTo: string | null; folder: string | null },
  ): Promise<MemoRef> {
    if (input.merge && !input.appendTo) throw new Invalid("組み込むメモを選んでください");
    const source = memoSourceLine(chat, new Date());
    const body = input.summarize && !input.merge ? await this.summarize(project, input.text) : input.text.trim();
    const block = `${source}\n\n${body}\n`;
    if (input.appendTo) {
      // HTML のメモの最後に Markdown の文を足すと、ページの外（</html> のあと）に出てしまうので足さない
      if (memoKindOf(input.appendTo) !== "markdown") throw new Invalid("HTML のメモには追記できません（Markdown のメモを選んでください）");
      const current = await this.read(project, input.appendTo);
      if (current.binary || current.truncated) throw new Invalid("このメモには足せません（大きすぎるか、文字のファイルではありません）");
      const merged = input.merge ? parseMergedMemo(await this.ask(project, memoMergePrompt(current.content, body, source))) : null;
      if (input.merge && !merged) throw new Invalid("AI がメモをまとめられませんでした");
      const content = merged ?? `${current.content.replace(/\s+$/, "")}\n\n---\n\n${block}`;
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
    if (!provider?.ask) throw new Invalid("このプロジェクトの AI は、メモの整理・まとめに対応していません");
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

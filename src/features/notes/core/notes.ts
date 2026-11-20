// プロジェクトのノート（保存先はプロジェクトの外。設定の notes_dir（なければ既定）の下の、プロジェクトごとのフォルダの Markdown）。パスはノートのフォルダからの相対で受け、フォルダの外を指さないか必ず確かめる（ファイルの操作はエディタのファイルと同じ土台の folderFiles）
import fs from "node:fs/promises";
import path from "node:path";
import { noteKindOf } from "@shared/notes/kinds";
import { chatNoteName, projectNoteFolder } from "@shared/notes/names";
import { UNTITLED_CHAT_TITLE, type Chat } from "@shared/chat/types";
import type { FileContent, SavedFile } from "@shared/foundation/fileTypes";
import { NOTE_EXTENSION, type NoteEntry, type NoteList, type NotePlan, type NoteSearchResult, type NoteRef } from "@shared/notes/types";
import type { Project } from "@shared/projects/types";
import type { ProviderId } from "@shared/settings/types";
import type { BusEvent } from "@shared/foundation/contract";
import type { TrashService } from "@/features/trash/core/service";
import type { Store } from "@/features/chat/core/index";
import { asInvalid, Conflict, Invalid, NotFound } from "@/foundation/core/errors";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import { folderFiles, type FolderFiles } from "@/foundation/core/files/folderFiles";
import { expandHome, realPathLoose } from "@/foundation/core/system/paths";
import { noteMergePrompt, notePlanPrompt, parseMergedNote, parseNotePlan, type PlanFile } from "./noteAi";
import { searchNoteTexts } from "./noteSearch";
import { NoteWatcher } from "./noteWatcher";

/** 一覧に出す数の上限（大きなフォルダを指しても重くならないように） */
const MAX_ENTRIES = 5000;

/** HTML のノートが読むファイル（CSS・画像・フォント）の大きさの上限（バイト） */
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

/** ノートのフォルダの中のファイルの操作（「.」で始まる名前は扱わない） */
const noteFiles = (dir: string): FolderFiles => folderFiles(dir, { outsideMessage: "ノートのフォルダの外のファイルです", maxAssetBytes: MAX_ASSET_BYTES, rejectDotNames: true });

/** チャットから作るノートの元の文の上限（文字） */
export const MAX_NOTE_SOURCE_CHARS = 200_000;

interface NoteServiceOptions {
  store: Pick<Store, "projects" | "settings" | "chats"> & { dbConnections: { remapNotePath(projectId: number, from: string, to: string): void } };
  /** 設定の notes_dir が null のときの親フォルダ（製品版と開発版で別） */
  defaultDir: string;
  providers: Record<ProviderId, AgentProvider>;
  publish: (e: BusEvent) => void;
  /** Kickoff のゴミ箱（ノートを「ゴミ箱に入れる」と 3 日取っておき、元に戻せる） */
  trashBin: Pick<TrashService, "putPath">;
  /** ノートのチャット（フォルダならその中のノートのもの）を、ノートと同じゴミ箱の行に入れる（trash/chatTrash.ts の trashNoteChats。なければ入れない） */
  trashNoteChats?: (projectId: number, notePath: string, itemId: string) => void;
}

/** チャットから作る・足すときに、文の前に置く出どころの行（どのチャットの、いつの文か） */
export function noteSourceLine(chat: Chat, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return `> チャット「${chat.title || UNTITLED_CHAT_TITLE}」から（${time}）`;
}

export class NoteService {
  readonly defaultDir: string;
  // Kickoff の外（Finder・ほかのアプリ）での変更も知らせる見張り（消したプロジェクトのものは、次に変わったときにやめる）
  private readonly watcher = new NoteWatcher((projectId, file) => {
    if (!this.opts.store.projects.get(projectId)) this.watcher.stop(projectId);
    else this.opts.publish({ type: "notes", project_id: projectId, path: file });
  });
  constructor(private readonly opts: NoteServiceOptions) {
    this.defaultDir = opts.defaultDir;
  }

  /** 見張りをすべてやめる（コアを止めるとき） */
  close(): void {
    this.watcher.close();
  }

  /**
   * dir をノートのフォルダにしているプロジェクト（except を除く。まだノートのフォルダを決めていないプロジェクトは数えない。
   * ~ とリンクを解いた実体で比べる）。画面がほかのプロジェクトと被っていると知らせるのに使う（被っていても使える）
   */
  usersOf(dir: string, except?: number): Project[] {
    const target = realPathLoose(path.resolve(expandHome(dir)));
    const root = this.rootDir();
    return this.opts.store.projects.list().filter((p) => {
      if (p.id === except) return false;
      const own = p.note_dir ? expandHome(p.note_dir) : p.note_folder ? path.join(root, p.note_folder) : null;
      return own !== null && realPathLoose(path.resolve(own)) === target;
    });
  }

  /** ノートの親フォルダ（設定。なければ既定） */
  rootDir(): string {
    return expandHome(this.opts.store.settings.get().notes_dir ?? this.opts.defaultDir);
  }

  /**
   * プロジェクトのノートのフォルダ（このプロジェクトだけ別の場所にしていればそこ、なければ親フォルダの下のフォルダ）。
   * フォルダ名をまだ決めていなければ、プロジェクト名から決めて覚える（ほかのプロジェクトのフォルダ名とは重ねない）
   */
  dirOf(project: Project): string {
    if (project.note_dir) return expandHome(project.note_dir);
    let folder = project.note_folder;
    if (!folder) {
      // ゴミ箱のプロジェクトのフォルダ名とも重ねない（戻したときに、2 つのプロジェクトが同じノートのフォルダを指さないように）
      folder = projectNoteFolder(project.name, [...this.opts.store.projects.list(), ...this.opts.store.projects.trashed()], project.id);
      this.opts.store.projects.update(project.id, { note_folder: folder });
    }
    return path.join(this.rootDir(), folder);
  }

  /** フォルダとファイルの一覧（隠しファイル・リンクは除く。フォルダがまだなければ空） */
  async list(project: Project): Promise<NoteList> {
    const dir = this.dirOf(project);
    const exists = await isDirectory(dir);
    // 一覧を見ている間は、外での変更も知らせる（フォルダが変わったら見張り直す）
    if (exists) this.watcher.watch(project.id, dir);
    const entries: NoteEntry[] = [];
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
   * すべてのプロジェクト（アーカイブしたものを除く）のノートの中の文を探す（⌘K の「ノート内の文言」）。
   * まだノートのフォルダを決めていないプロジェクトは探さない（探すだけでフォルダ名を決めないように）。同じフォルダを指すプロジェクトは 1 回だけ
   */
  async search(query: string): Promise<NoteSearchResult> {
    const seen = new Set<string>();
    const sources: { projectId: number; dir: string; files: string[] }[] = [];
    for (const project of this.opts.store.projects.list()) {
      if (project.archived_at || (!project.note_dir && !project.note_folder)) continue;
      const real = realPathLoose(this.dirOf(project));
      if (seen.has(real)) continue;
      seen.add(real);
      const list = await this.list(project);
      if (list.exists) sources.push({ projectId: project.id, dir: list.dir, files: list.entries.filter((e) => !e.dir).map((e) => e.path) });
    }
    return searchNoteTexts(sources, query);
  }

  /** ノートの中身（なければ 404） */
  async read(project: Project, file: string): Promise<FileContent> {
    const dir = await this.existingDir(project);
    this.watcher.watch(project.id, dir);
    return noteFiles(dir).read(file);
  }

  /** ノートのフォルダのファイルの中身そのもの（HTML のノートが相対パスで読む CSS・画像など。なければ 404・大きすぎれば 400） */
  async asset(project: Project, file: string): Promise<Buffer> {
    // リンクをたどった先も、ノートのフォルダの中だけにする
    return noteFiles(await this.existingDir(project)).asset(file);
  }

  /** ノートを保存する（開いたときの指紋 baseHash といまの中身が違えば 409。null なら上書き） */
  async write(project: Project, file: string, content: string, baseHash: string | null): Promise<SavedFile> {
    const saved = await noteFiles(await this.existingDir(project)).write(file, content, baseHash);
    this.changed(project, file);
    return saved;
  }

  /** 新しいノート・フォルダを作る（同じ名前があれば 409。途中のフォルダも作る） */
  async create(project: Project, file: string, kind: { dir: boolean; content?: string }): Promise<NoteRef> {
    const target = await this.pathIn(project, file);
    if (await exists(target)) throw new Conflict("同じ名前のノート・フォルダがあります");
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
  async move(project: Project, from: string, to: string): Promise<NoteRef> {
    await noteFiles(await this.existingDir(project)).move(from, to);
    // ノートのチャットも新しい名前へ付け替える（フォルダなら中のノートのものも）
    this.opts.store.chats.remapNotePath(project.id, from, to);
    // DB の接続の手順ノートも付け替える
    this.opts.store.dbConnections.remapNotePath(project.id, from, to);
    this.changed(project, to);
    return { path: to };
  }

  /** Kickoff のゴミ箱へ入れる（3 日は元に戻せる）。入れたゴミ箱の ID を返す（画面の「元に戻す」） */
  async trash(project: Project, file: string): Promise<string> {
    const files = noteFiles(await this.existingDir(project));
    const item = await files.trash(file, (target) => this.opts.trashBin.putPath(target, { projectId: project.id, details: { note: file } }));
    // ノートのチャットもノートと一緒にゴミ箱へ（一覧には 1 行。戻すと一緒に戻り、3 日たてば一緒に消える。作業中のものはそのまま）
    this.opts.trashNoteChats?.(project.id, file, item.id);
    this.changed(project, null);
    return item.id;
  }

  /**
   * チャットの文からノートを作る・足す。summarize なら AI（プロジェクトのプロバイダー）で要約してから。
   * appendTo があれば、そのノートの最後に区切り線を挟んで足す（merge なら、AI がそのノートと合わせてノート全体をまとめ直して書き換える）。
   * なければ folder（ノートのフォルダからの相対。null なら直下）に「<チャット名> チャットノート<n>.md」を作る
   */
  async fromChat(
    project: Project,
    chat: Chat,
    input: { text: string; summarize: boolean; merge: boolean; appendTo: string | null; folder: string | null },
  ): Promise<NoteRef> {
    if (input.merge && !input.appendTo) throw new Invalid("組み込むノートを選んでください");
    const source = noteSourceLine(chat, new Date());
    const body = input.summarize && !input.merge ? await this.summarize(project, input.text) : input.text.trim();
    const block = `${source}\n\n${body}\n`;
    if (input.appendTo) {
      // HTML のノートの最後に Markdown の文を足すと、ページの外（</html> のあと）に出てしまうので足さない
      if (noteKindOf(input.appendTo) !== "markdown") throw new Invalid("HTML のノートには追記できません（Markdown のノートを選んでください）");
      const current = await this.read(project, input.appendTo);
      if (current.binary || current.truncated) throw new Invalid("このノートには足せません（大きすぎるか、文字のファイルではありません）");
      const merged = input.merge ? parseMergedNote(await this.ask(project, noteMergePrompt(current.content, body, source))) : null;
      if (input.merge && !merged) throw new Invalid("AI がノートをまとめられませんでした");
      const content = merged ?? `${current.content.replace(/\s+$/, "")}\n\n---\n\n${block}`;
      await this.write(project, input.appendTo, content, current.hash);
      return { path: input.appendTo };
    }
    const folder = input.folder ?? "";
    const { entries } = await this.list(project);
    const names = entries
      .filter((e) => !e.dir && parentOf(e.path) === folder && e.path.endsWith(NOTE_EXTENSION))
      .map((e) => path.posix.basename(e.path, NOTE_EXTENSION));
    const name = chatNoteName(chat.title || UNTITLED_CHAT_TITLE, names);
    const file = folder ? `${folder}/${name}${NOTE_EXTENSION}` : `${name}${NOTE_EXTENSION}`;
    return this.create(project, file, { dir: false, content: `# ${name}\n\n${block}` });
  }

  /** ノートのフォルダの整理案（名前の変更・移動。AI に一覧と書き出しを見せて作り、使える案だけを返す。動かしはしない） */
  async aiPlan(project: Project, instruction: string | null): Promise<NotePlan> {
    const list = await this.list(project);
    const files = list.entries.filter((e) => !e.dir);
    if (files.length === 0) return { moves: [], skipped: 0 };
    const heads: PlanFile[] = await Promise.all(
      files.slice(0, 300).map(async (e) => ({ path: e.path, head: await readHead(path.join(list.dir, e.path)) })),
    );
    const dirs = list.entries.filter((e) => e.dir).map((e) => e.path);
    return parseNotePlan(await this.ask(project, notePlanPrompt(heads, dirs, instruction)), list.entries);
  }

  /** プロジェクトのプロバイダーに 1 回だけ聞く（質が要るので sonnet。対応していない・答えがなければ 400） */
  private async ask(project: Project, prompt: string): Promise<string> {
    const provider = this.opts.providers[project.provider];
    if (!provider?.ask) throw new Invalid("このプロジェクトの AI は、ノートの整理・まとめに対応していません");
    const answer = await provider.ask(prompt, { model: "standard" }).catch(asInvalid);
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

  /** ノートのフォルダ（なければ 404） */
  private async existingDir(project: Project): Promise<string> {
    const dir = this.dirOf(project);
    if (!(await isDirectory(dir))) throw new NotFound("ノートのフォルダがありません");
    return dir;
  }

  /**
   * ノートのフォルダの中の絶対パス（外を指せば 400。フォルダそのものも指せない）。
   * 隠しファイル（「.」で始まる名前）は扱わない。フォルダがなければ作る
   */
  private async pathIn(project: Project, file: string): Promise<string> {
    if (file.split("/").some((part) => part.startsWith("."))) throw new Invalid("「.」で始まる名前は使えません");
    const dir = this.dirOf(project);
    await fs.mkdir(dir, { recursive: true });
    return noteFiles(dir).inside(file);
  }

  private changed(project: Project, file: string | null) {
    this.opts.publish({ type: "notes", project_id: project.id, path: file });
  }
}

/** 相対パスの親フォルダ（直下なら ""） */
function parentOf(file: string): string {
  const i = file.lastIndexOf("/");
  return i < 0 ? "" : file.slice(0, i);
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

// プロジェクトのノート（保存先はプロジェクトの外。場所は noteDir.ts）。パスはノートのフォルダからの相対で受け、フォルダの外を指さないか必ず確かめる
// （ファイルの操作はエディタのファイルと同じ土台の folderFiles）。動かした・ゴミ箱へ入れたら onMoved・onTrashed で知らせる（ノートのチャット・DB の手順ノート）
import fs from "node:fs/promises";
import path from "node:path";
import type { FileContent, SavedFile } from "@shared/foundation/fileTypes";
import type { NoteEntry, NoteList, NoteSearchResult, NoteRef } from "@shared/notes/types";
import type { Project } from "@shared/projects/types";
import type { BusEvent } from "@shared/foundation/contract";
import type { TrashApi } from "@/features/trash/core/index";
import type { ProjectStore } from "@/features/projects/core/index";
import { NotFound } from "@/foundation/core/errors";
import { folderFiles, type FolderFiles } from "@/foundation/core/files/folderFiles";
import { realPathLoose } from "@/foundation/core/system/paths";
import type { NoteDirs } from "./noteDir";
import { searchNoteTexts } from "./noteSearch";
import { NoteWatcher } from "./noteWatcher";

/** 一覧に出す数の上限（大きなフォルダを指しても重くならないように） */
const MAX_ENTRIES = 5000;

/** HTML のノートが読むファイル（CSS・画像・フォント）の大きさの上限（バイト） */
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

/** ノートのフォルダの中のファイルの操作（「.」で始まる名前は扱わない） */
const noteFiles = (dir: string): FolderFiles => folderFiles(dir, { outsideMessage: "ノートのフォルダの外のファイルです", maxAssetBytes: MAX_ASSET_BYTES, rejectDotNames: true });

/** ノートを動かした（from・to はノートのフォルダからの相対） */
export interface NoteMoved {
  project_id: number;
  from: string;
  to: string;
}
/** ノートをほかのプロジェクト（共通のノートを含む）のノートのフォルダへ動かした（project_id は元のプロジェクト） */
export interface NoteMovedAcross extends NoteMoved {
  to_project_id: number;
}
/** ノートをゴミ箱へ入れた（trash_id は入れたゴミ箱の行） */
export interface NoteTrashed {
  project_id: number;
  path: string;
  trash_id: string;
}

interface NoteServiceOptions {
  dirs: NoteDirs;
  projects: Pick<ProjectStore, "get" | "list">;
  publish: (e: BusEvent) => void;
  /** Kickoff のゴミ箱（ノートを「ゴミ箱に入れる」と 3 日取っておき、元に戻せる） */
  trashBin: Pick<TrashApi, "putPath">;
}

export class NoteService {
  private readonly moved: ((e: NoteMoved) => void)[] = [];
  private readonly trashed: ((e: NoteTrashed) => void)[] = [];
  private readonly movedAcross: ((e: NoteMovedAcross) => void)[] = [];
  // Kickoff の外（Finder・ほかのアプリ）での変更も知らせる見張り（消したプロジェクトのものは、次に変わったときにやめる）
  private readonly watcher = new NoteWatcher((projectId, file) => {
    if (!this.opts.projects.get(projectId)) this.watcher.stop(projectId);
    else this.opts.publish({ type: "notes", project_id: projectId, path: file });
  });
  constructor(private readonly opts: NoteServiceOptions) {}

  /** 見張りをすべてやめる（コアを止めるとき） */
  close(): void {
    this.watcher.close();
  }

  /** ノートを動かしたときに呼ぶ（登録の順に。知らせの notes より前） */
  onMoved(fn: (e: NoteMoved) => void): void {
    this.moved.push(fn);
  }

  /** ほかのプロジェクトへ動かしたとき（ノートの外の画像の許可を付け替える。ノートのチャットは noteTransfer.ts が移す） */
  onMovedAcross(fn: (e: NoteMovedAcross) => void): void {
    this.movedAcross.push(fn);
  }

  /** ノートをゴミ箱へ入れたときに呼ぶ */
  onTrashed(fn: (e: NoteTrashed) => void): void {
    this.trashed.push(fn);
  }

  /** フォルダとファイルの一覧（隠しファイル・リンクは除く。フォルダがまだなければ空） */
  async list(project: Project): Promise<NoteList> {
    const dir = this.opts.dirs.dirOf(project);
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
    for (const project of this.opts.projects.list()) {
      if (project.archived_at || (!project.note_dir && !project.note_folder)) continue;
      const real = realPathLoose(this.opts.dirs.dirOf(project));
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
    const saved = await noteFiles(await this.existingDir(project, true)).write(file, content, baseHash);
    this.changed(project, file);
    return saved;
  }

  /** 新しいノート・フォルダを作る（同じ名前があれば 409。途中のフォルダも作る。いまある途中のフォルダのリンクが外を指せば 400） */
  async create(project: Project, file: string, kind: { dir: boolean; content?: string }): Promise<NoteRef> {
    // ノートのフォルダがまだなければ作る
    const dir = this.opts.dirs.ensureNoteDir(project);
    await fs.mkdir(dir, { recursive: true });
    await noteFiles(dir).create(file, kind);
    this.changed(project, file);
    return { path: file };
  }

  /** 名前を変える・ほかのフォルダへ動かす（行き先に同じ名前があれば 409） */
  async move(project: Project, from: string, to: string): Promise<NoteRef> {
    await noteFiles(await this.existingDir(project, true)).move(from, to);
    // ノートのチャット・DB の接続の手順ノートも新しい名前へ付け替える（フォルダなら中のノートのものも）
    for (const fn of this.moved) fn({ project_id: project.id, from, to });
    this.changed(project, to);
    return { path: to };
  }

  /**
   * ほかのプロジェクト（共通のノートを含む）のノートのフォルダへ動かす（行き先に同じ名前があれば 409）。ノートのチャットの付け替えは呼ぶ側
   * （noteTransfer.ts。チャットもプロジェクトを移す）。DB の接続の手順ノートは元のプロジェクトの接続なので onMoved で付いていかせない
   */
  async moveAcross(source: Project, from: string, target: Project, to: string): Promise<void> {
    const files = noteFiles(await this.existingDir(source, true));
    // 行き先のノートのフォルダは、まだなければフォルダ名を決めて作る
    const dir = this.opts.dirs.ensureNoteDir(target);
    await fs.mkdir(dir, { recursive: true });
    await files.moveTo(from, noteFiles(dir), to);
    for (const fn of this.movedAcross) fn({ project_id: source.id, from, to_project_id: target.id, to });
    this.changed(source, null);
    this.changed(target, to);
  }

  /** Kickoff のゴミ箱へ入れる（3 日は元に戻せる）。入れたゴミ箱の ID を返す（画面の「元に戻す」） */
  async trash(project: Project, file: string): Promise<string> {
    const files = noteFiles(await this.existingDir(project, true));
    const item = await files.trash(file, (target) => this.opts.trashBin.putPath(target, { projectId: project.id, details: { note: file } }));
    // ノートのチャットもノートと一緒にゴミ箱へ（一覧には 1 行。戻すと一緒に戻り、3 日たてば一緒に消える。作業中のものはそのまま）
    for (const fn of this.trashed) fn({ project_id: project.id, path: file, trash_id: item.id });
    this.changed(project, null);
    return item.id;
  }

  /** ノートのフォルダ（なければ 404。write なら書く前なのでフォルダ名を決めて覚える） */
  private async existingDir(project: Project, write = false): Promise<string> {
    const dir = write ? this.opts.dirs.ensureNoteDir(project) : this.opts.dirs.dirOf(project);
    if (!(await isDirectory(dir))) throw new NotFound("ノートのフォルダがありません");
    return dir;
  }

  private changed(project: Project, file: string | null) {
    this.opts.publish({ type: "notes", project_id: project.id, path: file });
  }
}

const isDirectory = (dir: string): Promise<boolean> => fs.stat(dir).then((s) => s.isDirectory(), () => false);

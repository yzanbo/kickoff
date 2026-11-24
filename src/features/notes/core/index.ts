// ノートの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { isInside, realPathLoose } from "@/foundation/core/system/paths";
import type { Project } from "@shared/projects/types";
import type { AiApi } from "@/features/ai/core/index";
import type { AttachmentsApi } from "@/features/attachments/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { ProjectsApi } from "@/features/projects/core/index";
import type { TrashApi } from "@/features/trash/core/index";
import { createNoteDirs } from "./noteDir";
import { NoteService, type NoteMoved, type NoteTrashed } from "./service";
import { createNoteAi } from "./noteAi";
import { createNoteChat } from "./noteChat";
import { noteRoutes } from "./routes/notes";
import { moveNoteToolGroup, openNoteToolGroup } from "./tools";
import { noteTurnParts } from "./turnParts";

export type { NoteMoved, NoteTrashed } from "./service";
/** プロジェクトのノートのフォルダ名（重なれば「名前-2」。新しいプロジェクトのダイアログの「ノートの保存先」で projects が使う） */
export { projectNoteFolder } from "@shared/notes/names";

/** ほかの機能に出す口 */
export interface NotesApi {
  /** プロジェクトのノートのフォルダ（読むだけ。フォルダ名をまだ決めていなければ、決めるならこうなるフォルダ） */
  dirOf(project: Project): string;
  /** ノートを動かしたとき（DB の接続の手順ノートの付け替え） */
  onMoved(fn: (e: NoteMoved) => void): void;
  /** ノートをゴミ箱へ入れたとき */
  onTrashed(fn: (e: NoteTrashed) => void): void;
}

export interface NotesDeps {
  trash: TrashApi;
  /** パスの :projectId の引き当て・ノートのフォルダ名を覚える */
  projects: Pick<ProjectsApi, "param" | "store">;
  /** ノートの案を AI に聞く */
  ai: AiApi;
  /** ノートのチャット（始める・動かした / ゴミ箱へ入れたノートのチャットを付け替える・一緒に入れる）と、実行に足すもの */
  chat: Pick<ChatApi, "runner" | "noteChats" | "chatParam" | "addTurnContributor" | "store">;
  /** ノートの写しを添付にし、ツールの結果の画像はノートのフォルダからも読む */
  attachments: AttachmentsApi;
}

/** プロジェクトのノート（保存先はプロジェクトの外。外での変更の見張りは止めるときに閉じる） */
export function createNotes(k: Kernel, deps: NotesDeps, env: { defaultDir: string }): CoreFeature<NotesApi> {
  const { bus } = k;
  const { trash, chat } = deps;
  const projects = deps.projects.store;
  const publish = (e: Parameters<typeof bus.publish>[0]) => bus.publish(e);
  const dirs = createNoteDirs({ projects, notesDir: () => k.settings.get().notes_dir, defaultDir: env.defaultDir });
  const notes = new NoteService({ dirs, projects, publish, trashBin: trash });
  // 動かした・ゴミ箱へ入れたノートの、ノートのチャットも付け替える・一緒に入れる（一覧には 1 行。戻すと一緒に戻り、3 日たてば一緒に消える）
  notes.onMoved((e) => chat.noteChats.moved(e.project_id, e.from, e.to));
  notes.onTrashed((e) => chat.noteChats.trashed(e.project_id, e.path, e.trash_id));
  // AI の kickoff-trash で入れたものは、消したチャットのプロジェクト、なければ元の場所を含むプロジェクト（本体のフォルダは projects、ここはノートのフォルダ）のゴミ箱に出す
  trash.addOriginResolver((origin) => projects.list().find((p) => (p.note_dir || p.note_folder) && isInside(realPathLoose(dirs.dirOf(p)), origin))?.id ?? null);
  // AI がノートを kickoff-trash で消したら、ノートのチャットも同じ行に入れる（画面から消したときと同じ）
  trash.addImportHook((item) => chat.noteChats.imported(item, dirs.dirOf));
  deps.attachments.addImageDir(dirs.dirOf);
  deps.attachments.useNoteDir(dirs.dirOf);
  // チャットの実行に、ノートのフォルダ（なければ決めて作る）・「ノート」の節・ノートのチャットの知らせを足す
  chat.addTurnContributor(noteTurnParts({ dirOf: dirs.ensureNoteDir, publish }));
  const toolDeps = { store: chat.store, notes: { dirOf: dirs.dirOf, move: notes.move.bind(notes) }, publish };
  const ai = createNoteAi({ notes, providers: deps.ai.providers });
  return {
    name: "notes",
    api: { dirOf: dirs.dirOf, onMoved: (fn) => notes.onMoved(fn), onTrashed: (fn) => notes.onTrashed(fn) },
    routes: [noteRoutes({ projectParam: deps.projects.param, chatParam: chat.chatParam, dirs, notes, ai, chat: createNoteChat({ notes, chat }), uploads: deps.attachments.uploads })],
    aiTools: [openNoteToolGroup(toolDeps), moveNoteToolGroup(toolDeps)],
    stop: () => notes.close(),
  };
}

// ノートの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { isInside, realPathLoose } from "@/foundation/core/system/paths";
import type { Project } from "@shared/projects/types";
import type { AiApi } from "@/features/ai/core/index";
import type { AttachmentsApi } from "@/features/attachments/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { ProjectsApi } from "@/features/projects/core/index";
import type { SettingsApi } from "@/features/settings/core/index";
import type { TrashApi } from "@/features/trash/core/index";
import type { WorkplaceMoveApi } from "@/features/workplaceMove/core/index";
import { createCommonNotes } from "./commonNotes";
import { createNoteDirs } from "./noteDir";
import { followNoteDirChanges } from "./noteDirChanges";
import { NoteService, type NoteMoved, type NoteTrashed } from "./service";
import { createNoteAi } from "./noteAi";
import { createNoteChat } from "./noteChat";
import { createNoteTransfer } from "./noteTransfer";
import { noteRoutes } from "./routes/notes";
import { moveNoteToolGroup, openNoteToolGroup, projectNoteDirToolGroup } from "./tools";
import { writeProjectNoteToolGroup } from "./projectNoteWrite";
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
  /** 共通のノートのプロジェクトを設定に合わせる（起動したとき start で流す。テストは機能を始めないので、要るテストが呼ぶ） */
  syncCommon(): Promise<void>;
}

export interface NotesDeps {
  trash: TrashApi;
  /** パスの :projectId の引き当て・ノートのフォルダ名を覚える・共通のノートのプロジェクトを用意して付け替える */
  projects: Pick<ProjectsApi, "param" | "store" | "isBusy" | "changeOwnedFolder">;
  /** 共通のノートのフォルダの設定を変える前と後 */
  settings: SettingsApi;
  /** ノートの案を AI に聞く */
  ai: AiApi;
  /** ノートのチャット（始める・動かした / ゴミ箱へ入れたノートのチャットを付け替える・一緒に入れる）と、実行に足すもの */
  chat: Pick<ChatApi, "runner" | "noteChats" | "chatParam" | "addTurnContributor" | "store">;
  /** ノートの写しを添付にし、ツールの結果の画像はノートのフォルダからも読む */
  attachments: AttachmentsApi;
  /** ノートをほかの欄（プロジェクト・共通のノート）へ動かすとき、ノートのチャットも行き先のプロジェクトへ移す */
  workplaceMove: Pick<WorkplaceMoveApi, "move">;
}

/** プロジェクトのノート（保存先はプロジェクトの外。外での変更の見張りは止めるときに閉じる） */
export function createNotes(k: Kernel, deps: NotesDeps, env: { defaultDir: string }): CoreFeature<NotesApi> {
  const { bus } = k;
  const { trash, chat } = deps;
  const projects = deps.projects.store;
  const publish = (e: Parameters<typeof bus.publish>[0]) => bus.publish(e);
  const dirs = createNoteDirs({ projects, notesDir: () => k.settings.get().notes_dir, defaultDir: env.defaultDir });
  const notes = new NoteService({ dirs, projects, publish, trashBin: trash });
  // 共通のノート（見えないプロジェクト）: 起動したときに用意し、フォルダの設定を変えたら付け替える
  const common = createCommonNotes({ projects: deps.projects, settings: () => k.settings.get(), defaultRoot: env.defaultDir, noteDirOwners: dirs.noteDirOwners });
  deps.settings.onUpdate(common.settingsHook);
  // ノートのフォルダの場所が変わったら、開いている文書が新しい場所を読み直すよう知らせる
  const stopDirChanges = followNoteDirChanges({ subscribe: (fn) => bus.subscribe(fn), list: () => projects.list(), dirOf: dirs.dirOf, publish });
  // 動かした・ゴミ箱へ入れたノートの、ノートのチャットも付け替える・一緒に入れる（一覧には 1 行。戻すと一緒に戻り、3 日たてば一緒に消える）
  notes.onMoved((e) => chat.noteChats.moved(e.project_id, e.from, e.to));
  notes.onTrashed((e) => chat.noteChats.trashed(e.project_id, e.path, e.trash_id));
  // AI の kickoff-trash で入れたものは、消したチャットのプロジェクト、なければ元の場所を含むプロジェクト（本体のフォルダは projects、ここはノートのフォルダ）のゴミ箱に出す
  trash.addOriginResolver((origin) => projects.list().find((p) => (p.note_dir || p.note_folder) && isInside(realPathLoose(dirs.dirOf(p)), origin))?.id ?? null);
  // AI がノートを kickoff-trash で消したら、ノートのチャットも同じ行に入れる（画面から消したときと同じ）
  trash.addImportHook((item) => chat.noteChats.imported(item, dirs.dirOf));
  deps.attachments.addImageDir(dirs.dirOf);
  deps.attachments.useNoteDir(dirs.dirOf);
  // チャットの実行に、ノートのフォルダと共通のノートのフォルダ（なければ決めて作る）・「ノート」の節・ノートのチャットの知らせを足す
  chat.addTurnContributor(noteTurnParts({ dirOf: dirs.ensureNoteDir, peekDirsOf: dirs.dirsOf, projects: () => projects.list(), commonProject: common.project, publish }));
  // 欄の間で動かす（ノートのチャットごと）。同じプロジェクトの中ならふつうの移動
  const transfer = createNoteTransfer({ notes, store: chat.store, isBusy: (chatId) => chat.runner.isBusy(chatId), moveChat: deps.workplaceMove.move, common });
  const toolDeps = { store: chat.store, dirOf: dirs.dirOf, transfer, common, publish };
  const ai = createNoteAi({ notes, providers: deps.ai.providers });
  return {
    name: "notes",
    api: { dirOf: dirs.dirOf, onMoved: (fn) => notes.onMoved(fn), onTrashed: (fn) => notes.onTrashed(fn), syncCommon: common.sync },
    routes: [noteRoutes({ projectParam: deps.projects.param, chatParam: chat.chatParam, dirs, notes, transfer, common, ai, chat: createNoteChat({ notes, chat }), uploads: deps.attachments.uploads })],
    aiTools: [openNoteToolGroup(toolDeps), projectNoteDirToolGroup(toolDeps), moveNoteToolGroup(toolDeps), writeProjectNoteToolGroup({ ...toolDeps, notes })],
    start: () => void common.sync(),
    stop: () => {
      stopDirChanges();
      notes.close();
    },
  };
}

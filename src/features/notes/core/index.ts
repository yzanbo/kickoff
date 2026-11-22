// ノートの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { isInside, realPathLoose } from "@/foundation/core/system/paths";
import type { AiApi } from "@/features/ai/core/index";
import type { AttachmentsApi } from "@/features/attachments/core/index";
import { trashNoteChats, trashNoteChatsOnImport, type ChatRunPort, type TurnContributor, type ChatStoreDeps } from "@/features/chat/core/index";
import type { TrashApi } from "@/features/trash/core/index";
import { NoteService } from "./notes";
import { noteRoutes } from "./routes/notes";
import { moveNoteToolGroup, openNoteToolGroup } from "./tools";
import { noteTurnParts } from "./turnParts";

export type { NoteService } from "./notes";

export interface NotesDeps {
  trash: TrashApi;
  /** ノートの案を AI に聞く */
  ai: AiApi;
  /** ノートのチャット */
  chat: { runner: ChatRunPort; store: Pick<ChatStoreDeps, "chats" | "events" | "agentSessions" | "logRevisions" | "db" | "settings" | "projects" | "groups" | "trash" | "snippets">; addTurnContributor(c: TurnContributor): void };
  /** ノートの写しを添付にし、ツールの結果の画像はノートのフォルダからも読む */
  attachments: AttachmentsApi;
  /** DB の接続の手順ノートを付け替える（ノートの名前を変えた・動かしたとき。database はあとに作るので組み立てが渡す） */
  remapDbNotes: (projectId: number, from: string, to: string) => void;
}

/** プロジェクトのノート（保存先はプロジェクトの外。外での変更の見張りは止めるときに閉じる） */
export function createNotes(k: Kernel, deps: NotesDeps, env: { defaultDir: string }): CoreFeature<NoteService> {
  const { bus } = k;
  const { trash, chat } = deps;
  const { store } = chat;
  const notes = new NoteService({
    store: { projects: store.projects, settings: store.settings, chats: store.chats, dbConnections: { remapNotePath: deps.remapDbNotes } },
    defaultDir: env.defaultDir,
    providers: deps.ai.providers,
    publish: (e) => bus.publish(e),
    trashBin: trash,
    trashNoteChats: (projectId, notePath, itemId) => trashNoteChats({ store, runner: chat.runner }, projectId, notePath, itemId),
  });
  // AI の kickoff-trash で入れたものは、消したチャットのプロジェクト、なければ元の場所を含むプロジェクト（本体のフォルダは projects、ここはノートのフォルダ）のゴミ箱に出す
  trash.addOriginResolver((origin) => store.projects.list().find((p) => (p.note_dir || p.note_folder) && isInside(realPathLoose(notes.dirOf(p)), origin))?.id ?? null);
  // AI がノートを kickoff-trash で消したら、ノートのチャットも同じ行に入れる（画面から消したときと同じ）
  trash.addImportHook((item) => trashNoteChatsOnImport({ store, runner: chat.runner, noteDirOf: (p) => notes.dirOf(p), publish: (e) => bus.publish(e) }, item));
  deps.attachments.addImageDir((p) => notes.dirOf(p));
  deps.attachments.useNoteDir((p) => notes.dirOf(p));
  // チャットの実行に、ノートのフォルダ・「ノート」の節・ノートのチャットの知らせを足す
  chat.addTurnContributor(noteTurnParts({ dirOf: (p) => notes.dirOf(p), publish: (e) => bus.publish(e) }));
  const toolDeps = { store, notes, publish: (e: Parameters<typeof bus.publish>[0]) => bus.publish(e) };
  return {
    name: "notes",
    api: notes,
    routes: [{ legacy: (app) => noteRoutes(app, { store, notes, runner: chat.runner, uploads: deps.attachments.uploads }) }],
    aiTools: [openNoteToolGroup(toolDeps), moveNoteToolGroup(toolDeps)],
    stop: () => notes.close(),
  };
}

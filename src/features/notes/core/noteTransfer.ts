// 欄の間（共通のノートとプロジェクト・プロジェクトどうし）でノートを動かす。ノートのチャット（フォルダなら中のノートのものも）と、その子チャットも
// 行き先のプロジェクトへ移す（workplaceMove の move。区切りを置き、会話を新しいセッションに写す）。ノートとチャットがほかのプロジェクトに
// 分かれてつながりが切れないよう、作業中のチャットがあればファイルを動かす前に断り、チャットを移せなければファイルとチャットを元に戻す
import type { Chat } from "@shared/chat/types";
import type { NoteRef } from "@shared/notes/types";
import type { Project } from "@shared/projects/types";
import type { ChatStoreDeps } from "@/features/chat/core/index";
import type { WorkplaceMoveApi } from "@/features/workplaceMove/core/index";
import { Conflict, NotFound } from "@/foundation/core/errors";
import type { CommonNotes } from "./commonNotes";
import type { NoteService } from "./service";

export interface NoteTransferDeps {
  notes: Pick<NoteService, "move" | "moveAcross">;
  store: Pick<ChatStoreDeps, "chats" | "projects">;
  isBusy(chatId: number): boolean;
  moveChat: WorkplaceMoveApi["move"];
  common: Pick<CommonNotes, "project" | "unavailable">;
}

/** ノートを動かす口（行き先が同じプロジェクトなら、ふつうの名前の変更・移動） */
export type NoteTransfer = (source: Project, from: string, targetId: number, to: string) => Promise<NoteRef>;

/** 移すチャットのノートのパスを、動かしたあとのパスへ（フォルダなら中のノートも） */
const remap = (notePath: string, from: string, to: string) => (notePath === from ? to : `${to}${notePath.slice(from.length)}`);

/** 行き先のプロジェクト（ゴミ箱・アーカイブ・使えない共通のノートは断る） */
function targetOf(d: NoteTransferDeps, id: number): Project {
  const target = d.store.projects.get(id);
  if (!target) throw new NotFound("移す先のプロジェクトが見つかりません");
  if (target.archived_at) throw new Conflict(`アーカイブしたプロジェクト「${target.name}」へは、ノートを動かせません`);
  if (target.kind === "common" && d.common.project()?.id !== target.id) throw new Conflict(`共通のノートを使えないため、ノートを動かせません（${d.common.unavailable()?.message ?? "共通のノートをまだ用意していません"}）`);
  return target;
}

export function createNoteTransfer(d: NoteTransferDeps): NoteTransfer {
  const { chats } = d.store;
  return async (source, from, targetId, to) => {
    if (targetId === source.id) return d.notes.move(source, from, to);
    const target = targetOf(d, targetId);
    // 移すチャット: ノートのチャット（アーカイブしたものも）と子孫。子孫を先に移す（プロジェクトを移す口と同じ順）
    const noteChats = chats.noteChats(source.id, from);
    const family: Chat[] = noteChats.flatMap((chat) => [...chats.descendants(chat.id), chat]);
    if (family.some((chat) => d.isBusy(chat.id))) {
      throw new Conflict(`「${from}」のノートのチャット（か、その子チャット）が作業中なので、ほかの欄へ動かせません。終わってから（または中断してから）動かしてください`);
    }
    await d.notes.moveAcross(source, from, target, to);
    const moved: Chat[] = [];
    try {
      for (const chat of family) {
        await d.moveChat(chat.id, { worktreePath: null, projectId: target.id, reason: "project_moved" });
        moved.push(chat);
        if (chat.note_path !== null) chats.setNotePath(chat.id, remap(chat.note_path, from, to));
      }
    } catch (e) {
      // 途中で失敗したら、移したチャットとファイルを元のプロジェクトへ戻す（ノートとチャットを別のプロジェクトに分けたままにしない）
      for (const chat of moved.reverse()) {
        await d.moveChat(chat.id, { worktreePath: null, projectId: source.id, reason: "project_moved" }).catch(() => {});
        if (chat.note_path !== null) chats.setNotePath(chat.id, chat.note_path);
      }
      await d.notes.moveAcross(target, to, source, from).catch(() => {});
      throw e;
    }
    return { path: to };
  };
}

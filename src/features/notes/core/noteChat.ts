// ノートのチャットを始める（ノートごとに 1 つのふつうのチャット。続きはふつうのチャットと同じく /api/chats/:id/messages）
import type { Chat } from "@shared/chat/types";
import type { NoteChatBody } from "@shared/notes/api";
import type { Project } from "@shared/projects/types";
import type { ChatApi } from "@/features/chat/core/index";
import { Conflict } from "@/foundation/core/errors";
import type { NoteService } from "./service";

export function createNoteChat(d: { notes: Pick<NoteService, "read">; chat: Pick<ChatApi, "runner" | "noteChats"> }) {
  return {
    /** ノートがなければ 404、もうあれば 409 */
    async startChat(project: Project, body: NoteChatBody): Promise<Chat> {
      await d.notes.read(project, body.path);
      if (d.chat.noteChats.hasChat(project.id, body.path)) throw new Conflict("このノートのチャットはもうあります");
      return d.chat.runner.start({ projectId: project.id, prompt: body.text ?? "", options: body.options, attachments: body.attachments, notePath: body.path });
    },
  };
}

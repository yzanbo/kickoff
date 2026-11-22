// 詳細を読んだチャット（id → Chat）。一覧（knownChats.ts）に入っていない・一覧を読まない所（アーカイブ済み・別ウィンドウ）でも
// チャットを引けるように、チャットの店（chatStore.ts）が詳細の応答で入れ、持っている間は知らせ・操作の応答で直し、店が中身を捨てたら一緒に捨てる
import type { Chat } from "@shared/chat/types";
import { createSignal } from "@/foundation/ui/store";

export interface SeenChats {
  get(id: number): Chat | undefined;
  /** 詳細の応答で読んだチャットを入れる */
  remember(chat: Chat): void;
  /** 持っているチャットだけを直す（知らせ・操作の応答。持っていなければ何もしない） */
  update(chat: Chat): void;
  forget(id: number): void;
  /** そのプロジェクトのチャットを捨てる（プロジェクトを消した） */
  forgetProject(projectId: number): void;
  subscribe(listener: () => void): () => void;
}

export function createSeenChats(): SeenChats {
  const chats = new Map<number, Chat>();
  const changed = createSignal();
  const notify = () => changed.emit();
  const remember = (chat: Chat) => {
    if (chats.get(chat.id) === chat) return;
    chats.set(chat.id, chat);
    notify();
  };
  return {
    get: (id) => chats.get(id),
    remember,
    update(chat) {
      if (chats.has(chat.id)) remember(chat);
    },
    forget(id) {
      if (chats.delete(id)) notify();
    },
    forgetProject(projectId) {
      let removed = false;
      for (const [id, chat] of chats) if (chat.project_id === projectId) removed = chats.delete(id) || removed;
      if (removed) notify();
    },
    subscribe: (listener) => changed.subscribe(listener),
  };
}

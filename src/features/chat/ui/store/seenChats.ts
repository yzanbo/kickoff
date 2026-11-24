// 詳細を読んだチャット（id → Chat。一覧の外で見たチャット）。一覧（knownChats.ts）に入っていない・一覧を読まない所（アーカイブ済み・別ウィンドウ）でも
// チャットを引けるように、チャットの店（chatStore.ts）が詳細の応答で入れ（タブが指すだけのチャットは行を 1 回取って入れ）、持っている間は知らせ・操作の応答で直し、店が中身を捨てたら一緒に捨てる
import type { Chat } from "@shared/chat/types";
import { createSignal } from "@/foundation/ui/store";
import { realTimers, type Timers } from "@shared/foundation/time";

export interface SeenChats {
  get(id: number): Chat | undefined;
  /** 詳細の応答で読んだチャットを入れる */
  remember(chat: Chat): void;
  /** 持っているチャットだけを直す（知らせ・操作の応答。持っていなければ何もしない） */
  update(chat: Chat): void;
  forget(id: number): void;
  /**
   * 持っていないチャットの行を、少し待って 1 回取って入れる（タブが指すチャットが、一覧にも詳細の覚えにもないとき。開いたばかりのタブは
   * 詳細を読んでいる途中のことが多いので待つ）。取りに行っている間は重ねて取らず、取れなかった ID（消えたチャットなど）は取り直さない。
   * 入れたあと忘れたら、また取れる。返す関数で、待っている間なら取りやめる
   */
  fetch(id: number, load: () => Promise<Chat>, delayMs?: number): () => void;
  /** そのプロジェクトのチャットを捨てる（プロジェクトを消した） */
  forgetProject(projectId: number): void;
  subscribe(listener: () => void): () => void;
}

/** 一覧の外のチャットの行を取るまで待つ時間（ミリ秒） */
const ROW_FETCH_DELAY_MS = 1000;

export function createSeenChats({ timer }: Pick<Timers, "timer"> = realTimers): SeenChats {
  const chats = new Map<number, Chat>();
  // 行を取りに行っている・取れなかった ID
  const fetching = new Set<number>();
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
    fetch(id, load, delayMs = ROW_FETCH_DELAY_MS) {
      return timer(() => {
        if (chats.has(id) || fetching.has(id)) return;
        fetching.add(id);
        load().then(
          (chat) => {
            fetching.delete(id);
            remember(chat);
          },
          () => undefined,
        );
      }, delayMs);
    },
    forgetProject(projectId) {
      let removed = false;
      for (const [id, chat] of chats) if (chat.project_id === projectId) removed = chats.delete(id) || removed;
      if (removed) notify();
    },
    subscribe: (listener) => changed.subscribe(listener),
  };
}

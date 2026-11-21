import type { Bus } from "@/foundation/core/bus";
import type { Store } from "@/features/chat/core/stores";
import { marksFrom } from "@/features/chat/core/run/machine/marks";
import type { ChatLive } from "@shared/chat/chatLive";
import { ChatRuntime, type Lane, type RuntimeLookup } from "./runtime";
import { liveOf } from "./turnState";

/**
 * チャットごとの作業中の状態（ChatRuntime）の入れ物。チャットの状態が変わったら、作業中の様子をまとめて chat_live で画面に配る。
 * 作るたびに（起動したときだけでなく、ゴミ箱から戻したときも）、保存した出す箱を読み戻す（止めておくか・線は保存したまま。
 * 自動で送る列を起動してから送るかは、Runner が利用者に聞く）
 */
export class ChatRuntimes implements RuntimeLookup {
  private readonly runtimes = new Map<number, ChatRuntime>();

  constructor(
    private readonly deps: {
      store: Store;
      bus?: Bus;
      /** 書き直している印の持ち時間（テストで差し替える） */
      editTtlMs?: number;
      /** 書き直している行が変わった・外れた */
      onEditingChanged: (chatId: number, lane: Lane, wasWaiting: boolean) => void;
      /** 圧縮が終わった（圧縮中・圧縮前指示から圧縮が終わるまでの「いま」を預かる間が終わった） */
      onCompactEnded?: (chatId: number) => void;
    },
  ) {}

  /** チャットの作業中の状態（まだなければ作る） */
  get(chatId: number): ChatRuntime {
    let runtime = this.runtimes.get(chatId);
    if (!runtime) {
      runtime = new ChatRuntime(chatId, () => this.publish(chatId), {
        marks: marksFrom(this.deps.store.events, chatId),
        save: (box) => this.deps.store.outbox.save(chatId, box),
        editTtlMs: this.deps.editTtlMs,
        onEditingChanged: (lane, wasWaiting) => this.deps.onEditingChanged(chatId, lane, wasWaiting),
        onCompactEnded: () => this.deps.onCompactEnded?.(chatId),
      });
      this.runtimes.set(chatId, runtime);
      const saved = this.deps.store.outbox.get(chatId);
      if (saved) runtime.restore(saved);
    }
    return runtime;
  }

  /** チャットの作業中の状態（まだなければ undefined。作らない） */
  peek(chatId: number): ChatRuntime | undefined {
    return this.runtimes.get(chatId);
  }

  /** 作業中か（まだ状態がなければ作業していない） */
  isBusy(chatId: number): boolean {
    return this.runtimes.get(chatId)?.busy ?? false;
  }

  /** 画面に配る作業中の様子（チャットの詳細の live。SSE の chat_live と同じ形） */
  live(chatId: number): ChatLive {
    return liveOf(this.get(chatId));
  }

  /** 作業中の様子を画面に配り直す（チャットがもうなければ配らない） */
  publish(chatId: number) {
    const chat = this.deps.store.chats.get(chatId);
    if (chat) this.deps.bus?.publish({ type: "chat_live", project_id: chat.project_id, chat_id: chatId, live: this.live(chatId) });
  }

  /** すべてのチャットの作業中の状態 */
  all(): ChatRuntime[] {
    return [...this.runtimes.values()];
  }

  /** 実行中のチャット（動かしているもの。送る準備の途中は数えない） */
  running(): ChatRuntime[] {
    return this.all().filter((r) => r.turn !== null);
  }

  /** チャットを消したとき（知らせない） */
  forget(chatId: number) {
    this.runtimes.get(chatId)?.dispose();
    this.runtimes.delete(chatId);
  }
}

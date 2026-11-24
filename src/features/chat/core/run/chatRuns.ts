import type { Bus, BusStage } from "@/foundation/core/bus";
import { systemClock, type Clock } from "@/foundation/core/clock";
import type { ChatStoreDeps } from "@/features/chat/core/stores";
import type { ProviderHandoffPort } from "@/features/chat/core/ports";
import { marksFrom } from "@/features/chat/core/run/machine/marks";
import type { RunEvent } from "@/features/chat/core/run/machine/types";
import type { ChatLive } from "@shared/chat/chatLive";
import type { ChatStatus } from "@shared/chat/types";
import { ChatRun, type ChatRunLookup } from "./chatRun";
import { liveOf } from "@/features/chat/core/live";

/**
 * チャットごとの作業中の状態（ChatRun）の入れ物。チャットの状態が変わったら、作業中の様子をまとめて chat_live で画面に配る。
 * 作るたびに（起動したときだけでなく、ゴミ箱から戻したときも）、保存した出す箱を読み戻す（止めておくか・線は保存したまま。
 * 自動で送る列を起動してから送るかは、殻が利用者に聞く）。chats.status が変わったら、chat の知らせのすぐあとに chat_live も配る
 */
export class ChatRuns implements ChatRunLookup {
  private readonly runtimes = new Map<number, ChatRun>();
  /** 最後に配った作業中の様子の status（変わった chat の知らせのあとに配り直す） */
  private readonly sentStatus = new Map<number, ChatStatus>();

  constructor(
    private readonly deps: {
      store: Pick<ChatStoreDeps, "chats" | "events" | "outbox" | "settings" | "projects">;
      /** AI を替えたあとの引き継ぎ（作業中の様子の provider_handoff。なければ引き継ぎはない） */
      providerHandoff?: Pick<ProviderHandoffPort, "pending">;
      bus?: Bus;
      /** 書き直している印の持ち時間（テストで差し替える） */
      editTtlMs?: number;
      /** 書き直しの持ち時間の時計（省けば本物） */
      clock?: Pick<Clock, "setTimeout" | "clearTimeout">;
      /** 出来事を渡す先（殻の dispatch） */
      dispatch?: (chatId: number, event: RunEvent) => void;
    },
  ) {
    deps.bus?.use(this.statusStage());
  }

  /** chats.status が変わった知らせ（chat）を先に配り、同じ流れのすぐあとに status の欄を直した作業中の様子（chat_live）を配る段 */
  private statusStage(): BusStage {
    return {
      accept: (event, emit) => {
        if (event.type !== "chat" || !this.runtimes.has(event.chat.id) || this.sentStatus.get(event.chat.id) === event.chat.status) return false;
        emit(event);
        this.publish(event.chat.id);
        return true;
      },
    };
  }

  /** チャットの作業中の状態（まだなければ作る） */
  get(chatId: number): ChatRun {
    let runtime = this.runtimes.get(chatId);
    if (!runtime) {
      runtime = new ChatRun(chatId, () => this.publish(chatId), {
        marks: marksFrom(this.deps.store.events, chatId),
        saved: this.deps.store.outbox.get(chatId),
        save: (box) => this.deps.store.outbox.save(chatId, box),
        clock: this.deps.clock ?? systemClock,
        editTtlMs: this.deps.editTtlMs,
        dispatch: (event) => this.deps.dispatch?.(chatId, event),
        read: {
          status: () => this.deps.store.chats.get(chatId)?.status ?? "completed",
          handoff: () => {
            const pending = this.deps.providerHandoff?.pending(chatId);
            if (!pending) return null;
            const blocked = pending.state === "ready" && pending.provider !== this.deps.store.chats.get(chatId)?.provider;
            return { state: blocked ? "blocked" : pending.state, provider: pending.provider };
          },
        },
      });
      this.runtimes.set(chatId, runtime);
    }
    return runtime;
  }

  /** チャットの作業中の状態（まだなければ undefined。作らない） */
  peek(chatId: number): ChatRun | undefined {
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
    if (!chat) return;
    const live = this.live(chatId);
    this.sentStatus.set(chatId, live.status);
    this.deps.bus?.publish({ type: "chat_live", project_id: chat.project_id, chat_id: chatId, live });
  }

  /** すべてのチャットの作業中の状態 */
  all(): ChatRun[] {
    return [...this.runtimes.values()];
  }

  /** 実行中のチャット（動かしているもの。送る準備の途中は数えない） */
  running(): ChatRun[] {
    return this.all().filter((r) => r.handle !== null);
  }

  /** チャットを消したとき（知らせない） */
  forget(chatId: number) {
    this.runtimes.get(chatId)?.dispose();
    this.runtimes.delete(chatId);
    this.sentStatus.delete(chatId);
  }
}

import type { Bus } from "../bus.js";
import type { Store } from "../db/store.js";
import type { TurnControl } from "../providers/types.js";
import { ChatQueue, type QueuePersistence } from "./queue.js";
import { QueueEdits } from "./queueEdits.js";
import { createRecoveryState, reconnectStateOf, type RecoveryState } from "./recovery/state.js";
import type { ApiRetryInfo, BackgroundState, ChatLive, CompactingState, QueueState } from "@shared/types";

/** ChatRuntime がそのまま持つ、画面に配る様子（送信待ちの列は queue、再接続待ちは recovery から組み立てる） */
interface LiveFields {
  background: BackgroundState | null;
  retry: ApiRetryInfo | null;
  compacting: CompactingState | null;
  stopping: boolean;
  /** 次の指示を書き直していたので、送らずに書き直しが終わるのを待っている（QueueState の waiting_edit） */
  waitingEdit: boolean;
  /** いまのやり取りが終わったら圧縮する（ChatLive の compact_next） */
  compactNext: boolean;
}

/**
 * 1 つのチャットの作業中の状態（保存しない。送信待ちの列だけは queue が DB に書く）。Runner が ChatRuntimes でチャットごとに 1 つ持ち、
 * 画面に配る形（ChatLive）はここから作る。画面に配る様子が変わったら onChange（ChatRuntimes が chat_live で配る）
 */
export class ChatRuntime {
  /** 動かしている実行の止め方（作業中でなければ null） */
  turn: AbortController | null = null;
  /**
   * 送る準備をしている（send で作業中かを確かめてから、指示を組み立てて動かし始めるまで）。作業中として数える。
   * 組み立ての間（await）に別の送信（送信待ちの自動送信と「いま」など）が割り込むと、同じチャットを 2 つ同時に動かし、片方の指示が会話から消えていた
   */
  preparing = false;
  /** 作業中のチャットへの操作（止めずに発言を足す・裏の作業を止める。プロバイダーが渡し、終わったら null） */
  control: TurnControl | null = null;
  /** 作業中に送った次の指示の待ちの列（送信待ち） */
  readonly queue: ChatQueue;
  /** 画面で書き直している送信待ちの指示（自動で送る次の指示なら、書き直しが終わるまで送らない） */
  readonly edits: QueueEdits;
  /** 通信の切断・使用枠の上限で止まったあとの再開の段取り（動かすのは recovery/recovery.ts の ChatRecovery） */
  readonly recovery: RecoveryState = createRecoveryState();
  private fields: LiveFields = { background: null, retry: null, compacting: null, stopping: false, waitingEdit: false, compactNext: false };

  constructor(
    readonly chatId: number,
    private readonly onChange: () => void,
    opts: { persistence?: QueuePersistence; editTtlMs?: number; onEditsChanged: () => void },
  ) {
    this.queue = new ChatQueue(chatId, onChange, opts.persistence);
    this.edits = new QueueEdits(opts.onEditsChanged, opts.editTtlMs);
  }

  /** 作業中か（動かしている・送る準備をしている） */
  get busy(): boolean {
    return this.turn !== null || this.preparing;
  }

  /** 会話を圧縮している最中なら、その様子（始めた時刻ときっかけ） */
  get compacting(): CompactingState | null {
    return this.fields.compacting;
  }

  /** いまのやり取りが終わったら圧縮するか */
  get compactNext(): boolean {
    return this.fields.compactNext;
  }

  /** 次の指示の書き直しが終わるのを待っているか */
  get waitingEdit(): boolean {
    return this.fields.waitingEdit;
  }

  /** 画面に配る様子を変える（変わったものがあれば、まとめて 1 回だけ知らせる） */
  update(patch: Partial<LiveFields>) {
    const changed = (Object.keys(patch) as (keyof LiveFields)[]).some((key) => patch[key] !== this.fields[key]);
    if (!changed) return;
    this.fields = { ...this.fields, ...patch };
    this.onChange();
  }

  /** 送信待ちの様子（チャットの詳細・SSE・送信待ちを変える API の応答で同じ形） */
  queueState(): QueueState {
    return { ...this.queue.snapshot(), waiting_edit: this.fields.waitingEdit };
  }

  /** 画面に配る形（チャットの詳細の live。SSE の chat_live と同じ形） */
  live(): ChatLive {
    const { background, retry, compacting, stopping, compactNext } = this.fields;
    return { queue: this.queueState(), background, retry, reconnect: reconnectStateOf(this.recovery), compacting, stopping, compact_next: compactNext };
  }

  /** チャットを消したとき（書き直しの持ち時間の待ちを止める） */
  dispose() {
    this.edits.dispose();
  }
}

/**
 * チャットごとの作業中の状態（ChatRuntime）の入れ物。チャットの状態が変わったら、作業中の様子をまとめて chat_live で画面に配る。
 * 作るときに、保存した送信待ちの列を読み戻す（前回の作業はアプリの終了で中断しているので、指示のある列は止めておく）
 */
export class ChatRuntimes {
  private readonly runtimes = new Map<number, ChatRuntime>();

  constructor(
    private readonly deps: {
      store: Store;
      bus?: Bus;
      /** 書き直している印の持ち時間（テストで差し替える） */
      editTtlMs?: number;
      /** 書き直している送信待ちの指示が変わった・外れた */
      onEditsChanged: (chatId: number) => void;
    },
  ) {
    for (const saved of deps.store.queues.list()) this.get(saved.chatId).queue.restore(saved);
  }

  /** チャットの作業中の状態（まだなければ作る） */
  get(chatId: number): ChatRuntime {
    let runtime = this.runtimes.get(chatId);
    if (!runtime) {
      runtime = new ChatRuntime(chatId, () => this.publish(chatId), {
        persistence: this.deps.store.queues,
        editTtlMs: this.deps.editTtlMs,
        onEditsChanged: () => this.deps.onEditsChanged(chatId),
      });
      this.runtimes.set(chatId, runtime);
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
    return this.get(chatId).live();
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

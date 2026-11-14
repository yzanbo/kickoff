import type { Bus } from "../bus.js";
import type { Store } from "../db/store.js";
import type { TurnControl } from "../providers/types.js";
import { ChatQueue, splitLegacyPostCompact, type QueuePersistence } from "./queue.js";
import { QueueEdits } from "./queueEdits.js";
import { createRecoveryState, reconnectStateOf, type RecoveryState } from "./recovery/state.js";
import type { ApiRetryInfo, BackgroundState, ChatLive, CompactingState, QueuedMessage, QueueState } from "@shared/types";

/** ChatRuntime がそのまま持つ、画面に配る様子（送信待ちの列は queue、再接続待ちは recovery から組み立てる） */
interface LiveFields {
  background: BackgroundState | null;
  retry: ApiRetryInfo | null;
  compacting: CompactingState | null;
  stopping: boolean;
  /** AI が図のツールの中身を書いている途中（ChatLive の drawing_visual） */
  drawingVisual: boolean;
  /** 次の指示を書き直していたので、送らずに書き直しが終わるのを待っている（QueueState の waiting_edit） */
  waitingEdit: boolean;
  /**
   * 圧縮後指示（post_compact。圧縮したら先頭に置き、圧縮が終わったらいまのやり取りに伝える）と、預かる間（holdsTells）に「いま」で送った指示
   * （圧縮したやり取りが終わってから送る。ChatLive の after_compact）
   */
  afterCompact: QueuedMessage[];
  /** 圧縮前指示を送ってから、圧縮が終わるまで（手で頼んだ圧縮の実行の間も。ChatLive の awaiting_compact） */
  awaitingCompact: boolean;
  /** 作業中に手で頼んだ圧縮の圧縮前指示を、いまの作業に足した（その作業が最後まで終わったら、手で頼んだ圧縮として圧縮する。ChatLive の compact_after_turn） */
  compactAfterTurn: boolean;
  /** 圧縮が終わって、預かった「いま」を順に送っている途中（送り終えるまで、新しい「いま」も預かって後ろに足す。画面には配らない） */
  deliveringAfterCompact: boolean;
  /**
   * 会話を圧縮したやり取りの途中（自動の圧縮が始まった作業・手で圧縮する実行・圧縮後指示を伝えた作業。作業の終わりで外す。ChatLive の compacted_turn）。
   * この間の「いま」は預かり、このやり取りが終わってから送る（圧縮後指示のやり取りに混ぜない）
   */
  compactedTurn: boolean;
  /**
   * いまの作業に「いま」を足せなくなった（Claude Code の入力を閉じたあと、作業が終わるまで。作業の終わりで外す。ChatLive の tells_closed）。
   * この間の「いま」は預かり、作業の終わりに送信待ちより先に送る（送信待ちに戻すと、止めている・一時停止の線があるときに送られず、順番も変わるため）
   */
  tellsClosed: boolean;
  /**
   * 子チャットで親の会話を写している（動かし始める前。親の記録が大きいと数十秒かかる。ChatLive の inheriting）。
   * この間の「いま」は預かり、動かし始めたらその作業に伝える
   */
  inheriting: boolean;
  /** 起動したときの送信待ちの確かめを待っている（答えるまで送信待ちを送らない。ChatLive の queue_resume） */
  resume: { interrupted: boolean } | null;
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
  /** 前の圧縮（またはコンテキストの消去）のあとで、もう圧縮前指示を送った（次の圧縮まで、自動の圧縮の前にもう足さない。保存しない） */
  preCompactSent = false;
  /** 預かった指示を送っている途中で、作業が送れない終わり方（通信の切断・使用枠の上限・アプリの終了）をした（送るのをやめて、残りを置く） */
  parkAfterCompact = false;
  /** 作業中に送った次の指示の待ちの列（送信待ち） */
  readonly queue: ChatQueue;
  /** 画面で書き直している送信待ちの指示（自動で送る次の指示なら、書き直しが終わるまで送らない） */
  readonly edits: QueueEdits;
  /** 画面で書き直している預かった指示（after_compact。送る順が来ても、書き直しが終わるまで送らない。決まりは送信待ちの edits と同じ） */
  readonly afterCompactEdits: QueueEdits;
  /** 通信の切断・使用枠の上限で止まったあとの再開の段取り（動かすのは recovery/recovery.ts の ChatRecovery） */
  readonly recovery: RecoveryState = createRecoveryState();
  private fields: LiveFields = { background: null, retry: null, compacting: null, stopping: false, drawingVisual: false, waitingEdit: false, afterCompact: [], awaitingCompact: false, compactAfterTurn: false, deliveringAfterCompact: false, compactedTurn: false, tellsClosed: false, inheriting: false, resume: null };
  /** 圧縮が終わった（圧縮後指示を伝える。圧縮中・圧縮前指示から圧縮が終わるまで（compactPhase）が外れたとき） */
  private readonly onCompactEnded: () => void;

  constructor(
    readonly chatId: number,
    private readonly onChange: () => void,
    opts: { persistence?: QueuePersistence; editTtlMs?: number; onEditsChanged: () => void; onAfterCompactEditsChanged?: () => void; onCompactEnded?: () => void },
  ) {
    this.onCompactEnded = opts.onCompactEnded ?? (() => {});
    this.queue = new ChatQueue(chatId, onChange, opts.persistence);
    this.edits = new QueueEdits(opts.onEditsChanged, opts.editTtlMs);
    this.afterCompactEdits = new QueueEdits(opts.onAfterCompactEditsChanged ?? (() => {}), opts.editTtlMs);
  }

  /** 作業中か（動かしている・送る準備をしている） */
  get busy(): boolean {
    return this.turn !== null || this.preparing;
  }

  /** 会話を圧縮している最中なら、その様子（始めた時刻ときっかけ） */
  get compacting(): CompactingState | null {
    return this.fields.compacting;
  }

  /**
   * 「いま」を預かるか: 圧縮中か、圧縮前指示を送ってから圧縮が終わるまで（awaitingCompact）か、圧縮したやり取りの途中（compactedTurn。
   * 圧縮後指示のやり取りが終わるまで）か、圧縮のあとに預かった指示を送っている途中。
   * 圧縮の前に足すと、圧縮前指示の作業に混ざり、画面では圧縮より上に出て、要約したあとの会話に入ったかも分からないため。
   * 圧縮のあとに足すと、圧縮後指示のやり取りに混ざるため。送っている途中に足すと、圧縮後指示・前に預かった指示より先に入りうるため。
   * 預かった指示を書き直している間も（その指示より先に入らないように）、いまの作業に足せなくなったあと（tellsClosed。先に預かった指示より先に入らないように）も預かる
   */
  get holdsTells(): boolean {
    return this.compactPhase || this.fields.compactedTurn || this.fields.deliveringAfterCompact || this.editingAfterCompact || this.fields.tellsClosed || this.fields.inheriting;
  }

  /** 子チャットで親の会話を写しているか（動かし始める前） */
  get inheriting(): boolean {
    return this.fields.inheriting;
  }

  /** 止めるよう頼んだか（終わるまで。親の会話を写している間に頼んだときは、写し終えたら動かさずに止める） */
  get stopping(): boolean {
    return this.fields.stopping;
  }

  /** いまの作業に「いま」を足せなくなったか（作業の終わりまで預かる） */
  get tellsClosed(): boolean {
    return this.fields.tellsClosed;
  }

  /** 預かった指示のどれかを、画面で書き直しているか（書き直しが終わるまで、その指示から後ろは送らない） */
  get editingAfterCompact(): boolean {
    return this.fields.afterCompact.some((m) => this.afterCompactEdits.has(m.id));
  }

  /** 圧縮中か、圧縮前指示を送ってから圧縮が終わるまでか（外れたら、圧縮後指示を伝える） */
  get compactPhase(): boolean {
    return this.fields.compacting !== null || this.fields.awaitingCompact;
  }

  /** 圧縮したやり取りの途中か（終わるまで「いま」を預かる） */
  get compactedTurn(): boolean {
    return this.fields.compactedTurn;
  }

  /** 圧縮前指示を送ってから、圧縮が終わるまでか */
  get awaitingCompact(): boolean {
    return this.fields.awaitingCompact;
  }

  /** 起動したときの送信待ちの確かめを待っているか（待っていれば、前回の終了で作業の途中で止まったか） */
  get resume(): { interrupted: boolean } | null {
    return this.fields.resume;
  }

  /** 作業中に手で頼んだ圧縮の圧縮前指示を、いまの作業に足したか（その作業が最後まで終わったら圧縮する） */
  get compactAfterTurn(): boolean {
    return this.fields.compactAfterTurn;
  }

  /** 圧縮のあとに、預かった「いま」を順に送っている途中か */
  get deliveringAfterCompact(): boolean {
    return this.fields.deliveringAfterCompact;
  }

  /** 圧縮中に「いま」で送り、圧縮が終わるのを待っている指示 */
  get afterCompact(): QueuedMessage[] {
    return this.fields.afterCompact;
  }

  /** 次の指示の書き直しが終わるのを待っているか */
  get waitingEdit(): boolean {
    return this.fields.waitingEdit;
  }

  /** もう圧縮が終わっているのに、伝えていない預かった指示があれば伝える（圧縮中を外したあとで、圧縮後指示を先頭に置いたときなど） */
  flushAfterCompact() {
    if (!this.compactPhase && !this.fields.deliveringAfterCompact && this.fields.afterCompact.length > 0) this.onCompactEnded();
  }

  /** 画面に配る様子を変える（変わったものがあれば、まとめて 1 回だけ知らせる） */
  update(patch: Partial<LiveFields>) {
    const changed = (Object.keys(patch) as (keyof LiveFields)[]).some((key) => patch[key] !== this.fields[key]);
    if (!changed) return;
    const phase = this.compactPhase;
    this.fields = { ...this.fields, ...patch };
    this.onChange();
    if (phase && !this.compactPhase && !this.fields.deliveringAfterCompact) this.onCompactEnded();
  }

  /** 送信待ちの様子（チャットの詳細・SSE・送信待ちを変える API の応答で同じ形） */
  queueState(): QueueState {
    return { ...this.queue.snapshot(), waiting_edit: this.fields.waitingEdit };
  }

  /** 画面に配る形（チャットの詳細の live。SSE の chat_live と同じ形） */
  live(): ChatLive {
    const { background, retry, compacting, stopping, drawingVisual, afterCompact, awaitingCompact, compactAfterTurn, compactedTurn, tellsClosed, inheriting, resume } = this.fields;
    return {
      queue: this.queueState(),
      background,
      retry,
      reconnect: reconnectStateOf(this.recovery),
      compacting,
      stopping,
      drawing_visual: drawingVisual,
      after_compact: afterCompact,
      awaiting_compact: awaitingCompact,
      compact_after_turn: compactAfterTurn,
      compacted_turn: compactedTurn,
      tells_closed: tellsClosed,
      inheriting,
      queue_resume: resume,
    };
  }

  /** チャットを消したとき（書き直しの持ち時間の待ちを止める） */
  dispose() {
    this.edits.dispose();
    this.afterCompactEdits.dispose();
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
      /** 書き直している預かった指示が変わった・外れた */
      onAfterCompactEditsChanged?: (chatId: number) => void;
      /** 圧縮が終わった（圧縮中・圧縮前指示から圧縮が終わるまでの「いま」を預かる間が終わった） */
      onCompactEnded?: (chatId: number) => void;
    },
  ) {
    for (const saved of deps.store.queues.list()) {
      // 前の版で送信待ちに入った圧縮後指示は、送信待ちから外して預かりに移す（起動しただけでは送らず、次に送った作業に伝える）
      const { queue, held } = splitLegacyPostCompact(saved);
      const runtime = this.get(saved.chatId);
      runtime.queue.restore(queue);
      if (held.length > 0) runtime.update({ afterCompact: held });
    }
  }

  /** チャットの作業中の状態（まだなければ作る） */
  get(chatId: number): ChatRuntime {
    let runtime = this.runtimes.get(chatId);
    if (!runtime) {
      runtime = new ChatRuntime(chatId, () => this.publish(chatId), {
        persistence: this.deps.store.queues,
        editTtlMs: this.deps.editTtlMs,
        onEditsChanged: () => this.deps.onEditsChanged(chatId),
        onAfterCompactEditsChanged: () => this.deps.onAfterCompactEditsChanged?.(chatId),
        onCompactEnded: () => this.deps.onCompactEnded?.(chatId),
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

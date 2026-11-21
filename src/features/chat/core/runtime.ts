import type { Bus } from "@/foundation/core/bus";
import type { Store } from "@/features/chat/core/stores";
import { ChatQueue, type QueuePersistence } from "./queue";
import { QueueEdits } from "./queueEdits";
import { createRecoveryState, type RecoveryState } from "@/features/chat/core/run/machine/recoveryState";
import type { Compaction, TurnKind } from "@/features/chat/core/run/machine/types";
import type { ChatLive, QueueState, RestartResumeState, WorkplaceMoveReservation } from "@shared/chat/chatLive";
import { emptyNext, liveOf, type NextTurn, type TurnPatch, type TurnState } from "./turnState";
import type { QueuedMessage } from "@shared/chat/types";

/** ChatRuntime がそのまま持つ、画面に配る様子（送信待ちの列は queue、再接続待ちは recovery、作業ごとの様子は turn から組み立てる） */
interface LiveFields {
  /** 次の指示を書き直していたので、送らずに書き直しが終わるのを待っている（QueueState の waiting_edit） */
  waitingEdit: boolean;
  /**
   * 圧縮後指示（post_compact。圧縮したら先頭に置き、圧縮が終わったらいまのやり取りに伝える）と、預かる間（holdsTells）に「いま」で送った指示
   * （圧縮したやり取りが終わってから送る。ChatLive の after_compact）
   */
  afterCompact: QueuedMessage[];
  /** 圧縮が終わって、預かった「いま」を順に送っている途中（送り終えるまで、新しい「いま」も預かって後ろに足す。画面には配らない） */
  deliveringAfterCompact: boolean;
  /**
   * 子チャットで親の会話を写している（動かし始める前。親の記録が大きいと数十秒かかる。ChatLive の inheriting）。
   * この間の「いま」は預かり、動かし始めたらその作業に伝える
   */
  inheriting: boolean;
  /** 起動したときの再開の確かめを待っている（答えるまで続けない・送信待ちを送らない。ChatLive の restart_resume） */
  resume: RestartResumeState | null;
  /** AI が予約した作業場所の移動（ChatLive の workplace_move。中身は workplaceReservation.ts が持つ） */
  workplaceMove: WorkplaceMoveReservation | null;
}

/**
 * 1 つのチャットの作業中の状態（保存しない。送信待ちの列だけは queue が DB に書く）。Runner が ChatRuntimes でチャットごとに 1 つ持ち、
 * 画面に配る形（ChatLive）はここから liveOf で作る。画面に配る様子が変わったら onChange（ChatRuntimes が chat_live で配る）
 */
export class ChatRuntime {
  /** 動かしている作業（作業中でなければ null） */
  turn: TurnState | null = null;
  /**
   * 送る準備をしている（send で作業中かを確かめてから、指示を組み立てて動かし始めるまで）。作業中として数える。
   * 組み立ての間（await）に別の送信（送信待ちの自動送信と「いま」など）が割り込むと、同じチャットを 2 つ同時に動かし、片方の指示が会話から消えていた
   */
  preparing = false;
  /** AI の交代の準備中。送信待ちを取り出したり「いま」を預けたりしない。 */
  switchingProvider = false;
  /**
   * 次に AI へ送るものに一度だけ添える Kickoff からの知らせ（利用者が作業場所を移す予約を取り消したのに、いまの作業に足せなかったとき。
   * 次の実行の文脈か、次に伝える発言の頭に添えて外す。保存しない）
   */
  pendingNote: string | null = null;
  /** 前の圧縮（またはコンテキストの消去）のあとで、もう圧縮前指示を送った（次の圧縮まで、自動の圧縮の前にもう足さない。保存しない） */
  preCompactSent = false;
  /** AI の書き込み先の守りの承認カードで「このチャットでは許可」を選んだファイル（実体のパス。作業をまたいで持ち、保存しない = アプリを終えたら聞き直す） */
  readonly writeAllowed = new Set<string>();
  /** 預かった指示を送っている途中で、作業が送れない終わり方（通信の切断・使用枠の上限・アプリの終了）をした（送るのをやめて、残りを置く） */
  parkAfterCompact = false;
  /** 作業していない間に立てて、次の作業に持ち越す印 */
  next: NextTurn = emptyNext();
  /** 作業中に送った次の指示の待ちの列（送信待ち） */
  readonly queue: ChatQueue;
  /** 画面で書き直している送信待ちの指示（自動で送る次の指示なら、書き直しが終わるまで送らない） */
  readonly edits: QueueEdits;
  /** 画面で書き直している預かった指示（after_compact。送る順が来ても、書き直しが終わるまで送らない。決まりは送信待ちの edits と同じ） */
  readonly afterCompactEdits: QueueEdits;
  /** 通信の切断・使用枠の上限で止まったあとの再開の段取り（動かすのは recovery/recovery.ts の ChatRecovery） */
  readonly recovery: RecoveryState = createRecoveryState();
  private fields: LiveFields = { waitingEdit: false, afterCompact: [], deliveringAfterCompact: false, inheriting: false, resume: null, workplaceMove: null };
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

  /** 画面に配る様子（読むだけ。変えるのは update） */
  get state(): Readonly<LiveFields> {
    return this.fields;
  }

  /** 作業中か（動かしている・送る準備をしている） */
  get busy(): boolean {
    return this.turn !== null || this.preparing;
  }

  /** いまの作業の印（作業していなければ、次の作業に持ち越す印） */
  private get marks(): { closed: boolean; stopRequested: boolean; compaction: Compaction } {
    const { turn } = this;
    return turn ? { closed: turn.tell === "closed", stopRequested: turn.stopRequested, compaction: turn.compaction } : this.next;
  }

  /**
   * 「いま」を預かるか: 圧縮中か、圧縮前指示を送ってから圧縮が終わるまで（awaiting）か、圧縮したやり取りの途中（done。
   * 圧縮後指示のやり取りが終わるまで）か、圧縮のあとに預かった指示を送っている途中。
   * 圧縮の前に足すと、圧縮前指示の作業に混ざり、画面では圧縮より上に出て、要約したあとの会話に入ったかも分からないため。
   * 圧縮のあとに足すと、圧縮後指示のやり取りに混ざるため。送っている途中に足すと、圧縮後指示・前に預かった指示より先に入りうるため。
   * 預かった指示を書き直している間も（その指示より先に入らないように）、いまの作業に足せなくなったあと（closed。先に預かった指示より先に入らないように）も預かる
   */
  get holdsTells(): boolean {
    const { closed, compaction } = this.marks;
    return this.compactPhase || compaction.done || this.fields.deliveringAfterCompact || this.editingAfterCompact || closed || this.fields.inheriting;
  }

  /** いまの作業に「いま」を足せなくなったか（作業の終わりまで預かる） */
  get tellsClosed(): boolean {
    return this.marks.closed;
  }

  /** いまの作業（なければ次の作業）の圧縮の様子 */
  get compaction(): Compaction {
    return this.marks.compaction;
  }

  /** 預かった指示のどれかを、画面で書き直しているか（書き直しが終わるまで、その指示から後ろは送らない） */
  get editingAfterCompact(): boolean {
    return this.fields.afterCompact.some((m) => this.afterCompactEdits.has(m.id));
  }

  /** 圧縮中か、圧縮前指示を送ってから圧縮が終わるまでか（外れたら、圧縮後指示を伝える） */
  get compactPhase(): boolean {
    const { compaction } = this.marks;
    return compaction.running !== null || compaction.awaiting;
  }

  /** もう圧縮が終わっているのに、伝えていない預かった指示があれば伝える（圧縮中を外したあとで、圧縮後指示を先頭に置いたときなど） */
  flushAfterCompact() {
    if (!this.compactPhase && !this.fields.deliveringAfterCompact && this.fields.afterCompact.length > 0) this.onCompactEnded();
  }

  /** 作業を始める（次の作業に持ち越した印を移す。手で圧縮する実行は、圧縮が終わるまで待つ間として始める） */
  startTurn(id: string, kind: TurnKind, abort: AbortController) {
    this.apply(() => {
      const { closed, stopRequested, compaction } = this.next;
      this.next = emptyNext();
      this.turn = { id, kind, abort, control: null, tell: closed ? "closed" : kind === "compact" ? "never" : "opening", compaction: { ...compaction, awaiting: compaction.awaiting || kind === "compact" }, stopRequested, background: null, retry: null, drawingVisual: false };
    });
  }

  /**
   * 作業ごとの状態を変える（作業していなければ、持ち越す印だけを変える）。口ができた・なくなったら「いま」を足す口もそろえる。
   * 画面に配る様子が変わったら配り、圧縮が終わったら（圧縮中・待つ間が外れたら）圧縮後指示を伝える
   */
  patchTurn(patch: TurnPatch) {
    this.apply(() => {
      const { turn } = this;
      const compaction = patch.compaction ? { ...this.compaction, ...patch.compaction } : undefined;
      if (!turn) {
        this.next = { closed: patch.tell === "closed" || this.next.closed, stopRequested: patch.stopRequested ?? this.next.stopRequested, compaction: compaction ?? this.next.compaction };
        return;
      }
      const { compaction: _compaction, ...rest } = patch;
      if ("control" in patch && (turn.tell === "opening" || turn.tell === "open")) turn.tell = patch.control ? "open" : "opening";
      Object.assign(turn, rest, compaction ? { compaction } : {});
    });
  }

  /** 作業が終わった（作業ごとの状態を丸ごと捨てる。圧縮前指示から圧縮が終わるまでの間だけは、続けて圧縮するかを決めるまで持ち越す） */
  endTurn() {
    this.apply(() => {
      const awaiting = this.turn?.compaction.awaiting ?? false;
      this.turn = null;
      this.next = { ...this.next, compaction: { ...this.next.compaction, awaiting } };
    });
  }

  /**
   * 圧縮した（記録を残したあと）: 次に上限に近づいたら、また圧縮前指示を送る。圧縮後指示があれば、預かった指示の先頭に置く
   * （圧縮が終わったら、それらより先に伝える。圧縮前指示のあとに送った指示は、必ず圧縮後指示のあとになる）。
   * 手で圧縮する実行（compactRun）の終わりまでは待つ間のままにする（Runner が実行の終わりで外し、圧縮後指示から送る）
   */
  compacted(post: QueuedMessage | null, compactRun: boolean) {
    this.preCompactSent = false;
    this.apply(() => {
      this.fields = { ...this.fields, afterCompact: [...(post ? [post] : []), ...this.fields.afterCompact] };
      const turn = this.turn;
      const compaction = { ...this.compaction, done: true, ...(compactRun ? {} : { awaiting: false }) };
      if (turn) turn.compaction = compaction;
      else this.next = { ...this.next, compaction };
    });
    // 圧縮中をもう外していた（知らせの順が前後した）ときは、ここで伝える
    this.flushAfterCompact();
  }

  /** 作業ごとの状態を変える: 画面に配る様子が変わったときだけ配り、圧縮中・待つ間が外れたら圧縮後指示を伝える */
  private apply(change: () => void) {
    const phase = this.compactPhase;
    const before = JSON.stringify(liveOf(this));
    change();
    if (JSON.stringify(liveOf(this)) !== before) this.onChange();
    if (phase && !this.compactPhase && !this.fields.deliveringAfterCompact) this.onCompactEnded();
  }

  /** 預かりの先頭を外す（compacted: 圧縮後指示を伝えた・送るので、そのやり取りを圧縮したやり取りの途中にする） */
  shiftHeld(compacted = false) {
    this.update({ afterCompact: this.fields.afterCompact.slice(1) });
    if (compacted) this.patchTurn({ compaction: { done: true } });
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

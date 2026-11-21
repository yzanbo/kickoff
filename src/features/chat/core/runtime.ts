import { randomUUID } from "node:crypto";
import { systemClock, type Clock, type TimerHandle } from "@/foundation/core/clock";
import { createRecoveryState, type RecoveryState } from "@/features/chat/core/run/machine/recoveryState";
import type { Compaction, TurnKind } from "@/features/chat/core/run/machine/types";
import type { RecoveryReason } from "@/features/chat/core/run/machine/recovery";
import type { TurnMarks } from "@/features/chat/core/run/machine/marks";
import type { QueueState, RestartResumeState, WorkplaceMoveReservation } from "@shared/chat/chatLive";
import { emptyNext, liveOf, type NextTurn, type TurnPatch, type TurnState } from "./turnState";
import { restoreOutbox, EMPTY_OUTBOX, type Outbox, type OutboxEnv } from "@shared/chat/outbox";
import { EDIT_HOLD_TTL_MS } from "@shared/chat/queueEditHolds";
import type { QueuedMessage } from "@shared/chat/types";

/** 出す箱の列（now = 預かり、later = 送信待ち） */
export type Lane = "now" | "later";

/** 出す箱に行を作るときの時刻と ID */
export const outboxEnv = (): OutboxEnv => ({ now: systemClock.iso(), newId: randomUUID });

/** チャットの作業中の状態を引く口（ChatRuntimes。ほかの機能は入れ物の中身を読まず、これだけを受ける） */
export interface RuntimeLookup {
  get(chatId: number): ChatRuntime;
}

/** ChatRuntime がそのまま持つ、画面に配る様子（出す箱は box、再接続待ちは recovery、作業ごとの様子は turn から組み立てる） */
interface LiveFields {
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
 * 1 つのチャットの作業中の状態（保存しない。出す箱だけは変わるたびに DB に書く）。Runner が ChatRuntimes でチャットごとに 1 つ持ち、
 * 画面に配る形（ChatLive）はここから liveOf で作る。画面に配る様子が変わったら onChange（ChatRuntimes が chat_live で配る）
 */
export class ChatRuntime {
  /** 動かしている作業（作業中でなければ null） */
  turn: TurnState | null = null;
  /** 送る準備をしている（作業中かを確かめてから動かし始めるまで。作業中として数え、組み立ての間に別の送信が割り込んで同じチャットを 2 つ動かさない） */
  preparing = false;
  /** AI の交代の準備中。送信待ちを取り出したり「いま」を預けたりしない。 */
  switchingProvider = false;
  /**
   * 次に AI へ送るものに一度だけ添える Kickoff からの知らせ（利用者が作業場所を移す予約を取り消したのに、いまの作業に足せなかったとき。
   * 次の実行の文脈か、次に伝える発言の頭に添えて外す。保存しない）
   */
  pendingNote: string | null = null;
  /** 記録から導く印（記録を足すたびに recordEvent が進める。もう圧縮前指示を送ったかは preCompactSent(marks)） */
  marks: TurnMarks;
  /** AI の書き込み先の守りの承認カードで「このチャットでは許可」を選んだファイル（実体のパス。作業をまたいで持ち、保存しない = アプリを終えたら聞き直す） */
  readonly writeAllowed = new Set<string>();
  /** 預かった指示を送っている途中で、作業が送れない終わり方（通信の切断・使用枠の上限・アプリの終了）をした（送るのをやめて、残りを置く） */
  parkAfterCompact = false;
  /** 作業していない間に立てて、次の作業に持ち越す印 */
  next: NextTurn = emptyNext();
  /** 出す箱（now = 預かり・圧縮後指示、later = 送信待ち。変えるのは setOutbox） */
  private box: Outbox = EMPTY_OUTBOX;
  /** 画面で書き直している行（列ごと。送る順が来ても、書き直しが終わるまでその行から後ろは送らない。知らせが持ち時間途絶えたら外す） */
  private edits: Record<Lane, string[]> = { now: [], later: [] };
  private editTimers: Partial<Record<Lane, TimerHandle>> = {};
  /** 通信の切断・使用枠の上限で止まったあとの再開の段取り（動かすのは recovery/recovery.ts の ChatRecovery） */
  readonly recovery: RecoveryState = createRecoveryState();
  /** Kickoff が送信待ちを止めている理由（門。outbox.paused = 利用者が止めた、とは分けて持ち、保存しない。送信待ちが空になったら外れる） */
  readonly gates: { recovery: RecoveryReason | null } = { recovery: null };
  private fields: LiveFields = { deliveringAfterCompact: false, inheriting: false, resume: null, workplaceMove: null };

  constructor(
    readonly chatId: number,
    private readonly onChange: () => void,
    private readonly opts: {
      marks: TurnMarks;
      /** 出す箱の保存先（省けば保存しない） */
      save?: (box: Outbox) => void;
      clock?: Pick<Clock, "setTimeout" | "clearTimeout">;
      editTtlMs?: number;
      /** 書き直している行が変わった・外れた（wasWaiting: その前に送信待ちの次の書き直しを待っていたか） */
      onEditingChanged: (lane: Lane, wasWaiting: boolean) => void;
      /** 圧縮が終わった（圧縮後指示を伝える。圧縮中・圧縮前指示から圧縮が終わるまで（compactPhase）が外れたとき） */
      onCompactEnded?: () => void;
    },
  ) {
    this.marks = opts.marks;
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
  private get flags(): { closed: boolean; stopRequested: boolean; compaction: Compaction } {
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
    const { closed, compaction } = this.flags;
    return this.compactPhase || compaction.done || this.fields.deliveringAfterCompact || this.editingAfterCompact || closed || this.fields.inheriting;
  }

  /** いまの作業に「いま」を足せなくなったか（作業の終わりまで預かる） */
  get tellsClosed(): boolean {
    return this.flags.closed;
  }

  /** いまの作業（なければ次の作業）の圧縮の様子 */
  get compaction(): Compaction {
    return this.flags.compaction;
  }

  /** 預かった指示のどれかを、画面で書き直しているか（書き直しが終わるまで、その指示から後ろは送らない） */
  get editingAfterCompact(): boolean {
    return this.box.now.some((m) => this.edits.now.includes(m.id));
  }

  /** 送信待ちを送らずに止めているか（利用者が止めた・Kickoff が門で止めた。画面の「止めています」） */
  get queuePaused(): boolean {
    return this.box.paused || (this.gates.recovery !== null && this.box.later.length > 0);
  }

  /** 送信待ちの門を立てる・外す（変わったら配る） */
  setRecoveryGate(reason: RecoveryReason | null) {
    if (this.gates.recovery === reason) return;
    this.gates.recovery = reason;
    this.onChange();
  }

  /** 送信待ちの次の指示を画面で書き直しているので、送らずに書き直しが終わるのを待っている（作業は終わり、送る準備ができている） */
  get waitingEdit(): boolean {
    const head = this.box.later[0];
    return !this.busy && !this.fields.resume?.queued && head !== undefined && !this.queuePaused && this.edits.later.includes(head.id);
  }

  /** 出す箱（読むだけ。変えるのは setOutbox） */
  get outbox(): Readonly<Outbox> {
    return this.box;
  }

  /** 出す箱を変える（変わったら保存して配る。silent なら配らない = すぐ取り出す行を画面に一瞬出さない） */
  setOutbox(next: Outbox, { silent = false }: { silent?: boolean } = {}) {
    if (next === this.box) return;
    this.writeBox(next);
    if (!silent) this.onChange();
  }

  /** 保存した箱を読み戻す（知らせない） */
  restore(saved: Outbox) {
    this.writeBox(restoreOutbox(saved));
  }

  private writeBox(next: Outbox) {
    this.box = next;
    if (next.later.length === 0) this.gates.recovery = null;
    this.opts.save?.(next);
  }

  /** その行を画面で書き直しているか */
  isEditing(lane: Lane, id: string): boolean {
    return this.edits[lane].includes(id);
  }

  /** 画面で書き直している行を丸ごと置き換える（空なら外す。その列にない行・圧縮後指示は数えない）。持ち時間はここから数え直す */
  setEditing(lane: Lane, ids: string[]) {
    ids = ids.filter((id) => this.box[lane].some((m) => m.id === id && !m.post_compact));
    const wasWaiting = this.waitingEdit;
    const clock = this.opts.clock ?? systemClock;
    clock.clearTimeout(this.editTimers[lane]);
    this.editTimers[lane] = ids.length > 0 ? clock.setTimeout(() => this.setEditing(lane, []), this.opts.editTtlMs ?? EDIT_HOLD_TTL_MS) : undefined;
    this.apply(() => {
      this.edits = { ...this.edits, [lane]: ids };
    });
    this.opts.onEditingChanged(lane, wasWaiting);
  }

  /** 圧縮中か、圧縮前指示を送ってから圧縮が終わるまでか（外れたら、圧縮後指示を伝える） */
  get compactPhase(): boolean {
    const { compaction } = this.flags;
    return compaction.running !== null || compaction.awaiting;
  }

  /** もう圧縮が終わっているのに、伝えていない預かった指示があれば伝える（圧縮中を外したあとで、圧縮後指示を先頭に置いたときなど） */
  flushAfterCompact() {
    if (!this.compactPhase && !this.fields.deliveringAfterCompact && this.box.now.length > 0) this.opts.onCompactEnded?.();
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
    this.apply(() => {
      if (post) this.writeBox({ ...this.box, now: [post, ...this.box.now] });
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
    if (phase && !this.compactPhase && !this.fields.deliveringAfterCompact) this.opts.onCompactEnded?.();
  }

  /** 預かりの先頭を外す（compacted: 圧縮後指示を伝えた・送るので、そのやり取りを圧縮したやり取りの途中にする） */
  shiftHeld(compacted = false) {
    this.setOutbox({ ...this.box, now: this.box.now.slice(1) });
    if (compacted) this.patchTurn({ compaction: { done: true } });
  }

  /** 起動したときの再開の確かめのうち、送信待ちを聞くのをやめる（送信待ちを自分で動かした・空になった。作業の途中で止まったことは聞き続ける） */
  answerRestartResume() {
    const { resume } = this.fields;
    if (resume) this.update({ resume: resume.interrupted ? { interrupted: true, queued: false } : null });
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
    const { later, stops } = this.box;
    return { messages: later, paused: this.queuePaused, stops, waiting_edit: this.waitingEdit };
  }

  /** チャットを消したとき（書き直しの持ち時間の待ちを止める） */
  dispose() {
    const clock = this.opts.clock ?? systemClock;
    for (const lane of ["now", "later"] as const) clock.clearTimeout(this.editTimers[lane]);
  }
}

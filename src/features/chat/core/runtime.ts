import { randomUUID } from "node:crypto";
import { systemClock, type Clock, type TimerHandle } from "@/foundation/core/clock";
import type { ProviderCallbacks } from "@/features/ai/core/index";
import { initialRunState } from "@/features/chat/core/run/machine/state";
import type { ChatRunState, Lane, RunEvent } from "@/features/chat/core/run/machine/types";
import type { TurnMarks } from "@/features/chat/core/run/machine/marks";
import type { ProviderHandoff, WorkplaceMoveReservation } from "@shared/chat/chatLive";
import type { Outbox, OutboxEnv } from "@shared/chat/outbox";
import { EDIT_HOLD_TTL_MS } from "@shared/chat/queueEditHolds";
import type { ApiRetryInfo, BackgroundState } from "@shared/ai/turnEvents";
import type { ChatStatus } from "@shared/chat/types";

export type { Lane };

/** 出す箱に行を作るときの時刻と ID */
export const outboxEnv = (): OutboxEnv => ({ now: systemClock.iso(), newId: randomUUID });

/** チャットの作業中の状態を引く口（ChatRuntimes。ほかの機能は入れ物の中身を読まず、これだけを受ける） */
export interface RuntimeLookup {
  get(chatId: number): ChatRuntime;
}

/** 作業中のチャットへの操作（プロバイダーが渡す） */
export type TurnControl = NonNullable<Parameters<NonNullable<ProviderCallbacks["control"]>>[0]>;

/** 動かしている作業の取っ手（止め方と、プロバイダーが渡す作業中の操作。作業が終わったら捨てる） */
export interface TurnHandle {
  abort: AbortController;
  control: TurnControl | null;
}

/** 作業ごとの表示だけの値（移り変わりに関わらないので step を通さず、変わったら配る。作業が終わったら空に戻す） */
export interface TurnDisplay {
  background: BackgroundState | null;
  retry: ApiRetryInfo | null;
  /** AI が図のツールの中身を書いている途中（ChatLive の drawing_visual） */
  drawingVisual: boolean;
}

export const EMPTY_DISPLAY: TurnDisplay = { background: null, retry: null, drawingVisual: false };

/**
 * 1 つのチャットの作業中の状態（保存しない。出す箱だけは変わるたびに DB に書く）。Runner が ChatRuntimes でチャットごとに 1 つ持つ。
 * 移り変わる状態（run。再開の段取りの門も）は step（run/machine/step.ts）の答えだけで変わり（Runner の dispatch が commit で書く）、殻の持ち物（作業の取っ手・表示・
 * 予約した移動）はここに直に持つ。画面に配る形（ChatLive）は live.ts の liveOf で作る
 */
export class ChatRuntime {
  /** 動かしている作業の取っ手（作業中でなければ null） */
  handle: TurnHandle | null = null;
  /** 作業ごとの表示だけの値 */
  private shown: TurnDisplay = EMPTY_DISPLAY;
  /**
   * 次に AI へ送るものに一度だけ添える Kickoff からの知らせ（利用者が作業場所を移す予約を取り消したのに、いまの作業に足せなかったとき。
   * 次の実行の文脈か、次に伝える発言の頭に添えて外す。保存しない）
   */
  pendingNote: string | null = null;
  /** 記録から導く印（記録を足すたびに recordEvent が進める。もう圧縮前指示を送ったかは preCompactSent(marks)） */
  marks: TurnMarks;
  /** AI の書き込み先の守りの承認カードで「このチャットでは許可」を選んだファイル（実体のパス。作業をまたいで持ち、保存しない = アプリを終えたら聞き直す） */
  readonly writeAllowed = new Set<string>();
  /** AI が予約した作業場所の移動（ChatLive の workplace_move。中身は workplaceReservation.ts が持つ） */
  private moveShown: WorkplaceMoveReservation | null = null;
  /** 足している途中の行の番号（足す命令ごとに増やす。結果より先に次の命令が出たら、前の結果は捨てる） */
  tellSeq = 0;
  private state: ChatRunState;
  private editTimers: Partial<Record<Lane, TimerHandle>> = {};

  constructor(
    readonly chatId: number,
    private readonly onChange: () => void,
    private readonly opts: {
      marks: TurnMarks;
      /** 保存した出す箱（読み戻す） */
      saved?: Outbox | null;
      /** 出す箱の保存先（省けば保存しない） */
      save?: (box: Outbox) => void;
      clock?: Pick<Clock, "setTimeout" | "clearTimeout">;
      editTtlMs?: number;
      /** 出来事を渡す（Runner の dispatch。プロバイダーの知らせ・予約した移動から） */
      dispatch?: (event: RunEvent) => void;
      /** 店から読む、チャットの状態（chats.status）と引き継ぎの門（ChatLive の status・provider_handoff） */
      read?: { status(): ChatStatus; handoff(): ProviderHandoff | null };
    },
  ) {
    this.marks = opts.marks;
    this.state = initialRunState(opts.saved ?? null);
  }

  /** 移り変わる状態（読むだけ。変えるのは Runner の dispatch） */
  get run(): ChatRunState {
    return this.state;
  }

  /** step の答えを書く（出す箱が変わったら保存する。配るのは dispatch の終わりにまとめて） */
  commit(next: ChatRunState) {
    if (next.outbox !== this.state.outbox) this.opts.save?.(next.outbox);
    this.state = next;
  }

  /** 出来事を渡す（Runner の dispatch） */
  dispatch(event: RunEvent) {
    this.opts.dispatch?.(event);
  }

  /** 作業中か（動かしている・送る準備をしている） */
  get busy(): boolean {
    return this.state.phase.kind !== "idle";
  }

  /** 出す箱（読むだけ） */
  get outbox(): Readonly<Outbox> {
    return this.state.outbox;
  }

  /** 作業ごとの表示だけの値 */
  get display(): TurnDisplay {
    return this.shown;
  }

  /** 表示だけの値を変える（変わったら配る） */
  setDisplay(patch: Partial<TurnDisplay>) {
    const next = { ...this.shown, ...patch };
    if (next.background === this.shown.background && next.retry === this.shown.retry && next.drawingVisual === this.shown.drawingVisual) return;
    this.shown = next;
    this.onChange();
  }

  /** 作業の取っ手を付け替える（始めるとき・終わったとき。表示だけの値は空に戻す） */
  setHandle(handle: TurnHandle | null) {
    this.handle = handle;
    this.shown = EMPTY_DISPLAY;
  }

  /** プロバイダーが作業中の操作を渡した・なくした（「いま」を足す口ができた・なくなった） */
  setControl(control: TurnControl | null) {
    if (!this.handle) return;
    this.handle.control = control;
    this.dispatch({ type: "tell_ready", ready: control !== null });
  }

  /** AI が予約した作業場所の移動（ChatLive の workplace_move） */
  get workplaceMove(): WorkplaceMoveReservation | null {
    return this.moveShown;
  }

  setWorkplaceMove(reservation: WorkplaceMoveReservation | null) {
    if (reservation === this.moveShown) return;
    this.moveShown = reservation;
    this.onChange();
  }

  /** チャットの状態（chats.status の写し） */
  get chatStatus(): ChatStatus {
    return this.opts.read?.status() ?? "completed";
  }

  /** AI の切り替えの引き継ぎの門（引き継ぎがなければ null） */
  handoff(): ProviderHandoff | null {
    return this.opts.read?.handoff() ?? null;
  }

  /** 書き直しの持ち時間の待ちを数え直す・止める（切れたら fire） */
  editTimer(lane: Lane, on: boolean, fire: () => void) {
    const clock = this.opts.clock ?? systemClock;
    clock.clearTimeout(this.editTimers[lane]);
    this.editTimers[lane] = on ? clock.setTimeout(fire, this.opts.editTtlMs ?? EDIT_HOLD_TTL_MS) : undefined;
  }

  /** 画面に配り直す */
  changed() {
    this.onChange();
  }

  /** チャットを消したとき（書き直しの持ち時間の待ちを止める） */
  dispose() {
    const clock = this.opts.clock ?? systemClock;
    for (const lane of ["now", "later"] as const) clock.clearTimeout(this.editTimers[lane]);
  }
}

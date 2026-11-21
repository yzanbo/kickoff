// 1 回の作業の状態（TurnState）と、作業していない間に次の作業へ持ち越す印・画面に配る形 liveOf（ChatRuntime から作る）
import type { ProviderCallbacks } from "@/features/ai/core/index";
import { reconnectStateOf } from "@/features/chat/core/run/machine/recoveryState";
import type { Compaction, TellGate, TurnKind } from "@/features/chat/core/run/machine/types";
import type { ApiRetryInfo, BackgroundState, CompactTrigger } from "@shared/ai/turnEvents";
import type { ChatLive, HoldReason, QueueState, WorkPhase } from "@shared/chat/chatLive";
import { isQueueAction, queueActionOf } from "@shared/chat/queueActions";
import type { ChatRuntime } from "./runtime";
import type { TurnRequest } from "./turn";

/** 作業中のチャットへの操作（プロバイダーが渡す） */
type TurnControl = NonNullable<Parameters<NonNullable<ProviderCallbacks["control"]>>[0]>;

/**
 * 1 回の作業の状態（動かし始めてから終わるまで。終わったら runtime.turn = null で丸ごと捨てる）。
 * 書くのは ChatRuntime.patchTurn だけ（変わったら画面に配り、圧縮が終わったら圧縮後指示を伝える）
 */
export interface TurnState {
  id: string;
  kind: TurnKind;
  /** 止め方 */
  abort: AbortController;
  /** 作業中のチャットへの操作（止めずに発言を足す・裏の作業を止める。プロバイダーが渡す） */
  control: TurnControl | null;
  /** 「いま」を足す口 */
  tell: TellGate;
  compaction: Compaction;
  /** 止めるよう頼んだ（終わるまで。画面の「停止中…」） */
  stopRequested: boolean;
  background: BackgroundState | null;
  retry: ApiRetryInfo | null;
  /** AI が図のツールの中身を書いている途中（ChatLive の drawing_visual） */
  drawingVisual: boolean;
  /** 手で圧縮する実行・その前の圧縮前指示のきっかけ（ほかの作業は null。ChatLive の compact_by） */
  compactBy: CompactTrigger | null;
}

/**
 * 作業していない間に立てて、次の作業に持ち越す印（作業を作るときに TurnState へ移し、その作業の終わりで外れる）。
 * 送る準備の間に「いま」を足せなかった・親の会話を写している間に止めた・続けて圧縮する前の待つ間・圧縮後指示の作業を送る前
 */
export interface NextTurn {
  closed: boolean;
  stopRequested: boolean;
  compaction: Compaction;
}

/** 作業ごとの状態のうち、書き換えられる欄（compaction は書いた項目だけを重ねる） */
export type TurnPatch = Partial<Pick<TurnState, "control" | "tell" | "stopRequested" | "background" | "retry" | "drawingVisual">> & { compaction?: Partial<Compaction> };

export const noCompaction = (): Compaction => ({ awaiting: false, afterTurn: false, running: null, done: false });
export const emptyNext = (): NextTurn => ({ closed: false, stopRequested: false, compaction: noCompaction() });

/** 画面に配る形（チャットの詳細の live。SSE の chat_live と同じ形）。古い欄（after_compact・awaiting_compact…）も同じ状態から作る */
export function liveOf(runtime: ChatRuntime): ChatLive {
  const { turn, state, compaction } = runtime;
  const phase = phaseOf(runtime);
  return {
    queue: queueStateOf(runtime),
    background: turn?.background ?? null,
    retry: turn?.retry ?? null,
    reconnect: reconnectStateOf(runtime.recovery),
    compacting: compaction.running,
    stopping: turn ? turn.stopRequested : runtime.next.stopRequested,
    drawing_visual: turn?.drawingVisual ?? false,
    after_compact: runtime.outbox.now,
    awaiting_compact: compaction.awaiting,
    compact_after_turn: compaction.afterTurn,
    compacted_turn: compaction.done,
    tells_closed: runtime.tellsClosed,
    inheriting: state.inheriting,
    restart_resume: state.resume,
    workplace_move: state.workplaceMove,
    phase,
    status: runtime.chatStatus,
    provider_handoff: runtime.handoff(),
    preparing_for: phase === "preparing" ? runtime.preparing : null,
    compact_by: phase === "awaiting_compact" ? (turn?.compactBy ?? (compaction.afterTurn ? "manual" : "auto")) : null,
    hold: holdOf(runtime),
    now: runtime.outbox.now,
    turn_end: state.workplaceMove ? [{ kind: "workplace_move", label: state.workplaceMove.label }] : [],
  };
}

/** 作業の段階（作業していない / 送る準備 / 圧縮中 / 圧縮前指示から圧縮が終わるまで / 圧縮したやり取りの途中 / ふつうの作業）。重なったら前のものを出す */
function phaseOf(runtime: ChatRuntime): WorkPhase {
  const { turn } = runtime;
  if (!turn) return runtime.preparing ? "preparing" : "idle";
  const { running, awaiting, done } = turn.compaction;
  return running ? "compacting" : awaiting ? "awaiting_compact" : done ? "compacted" : "running";
}

/**
 * 「いま」を預かる理由（預からなければ null。ChatRuntime.holdsTells はこれで決める。預かる場面を足したらここに足す）:
 * 親の会話を写している（動かし始めたらその作業に伝える）/ 圧縮中か、圧縮前指示を送ってから圧縮が終わるまで（圧縮前指示の作業に混ざり、
 * 画面では圧縮より上に出て、要約したあとの会話に入ったかも分からないため）/ 圧縮したやり取りの途中か、圧縮のあとに預かった指示を送っている途中
 * （圧縮後指示のやり取りに混ざる・前に預かった指示より先に入りうるため）/ いまの作業に足せなくなったあと（先に預かった指示より先に入らないように）/
 * 預かった指示を書き直している（その指示より先に入らないように）
 */
export function holdOf(runtime: ChatRuntime): HoldReason | null {
  const { turn, compaction, state } = runtime;
  if (state.inheriting) return "inherit";
  if (runtime.compactPhase) return "compact";
  if (compaction.done || state.deliveringAfterCompact) return "exchange";
  if (turn ? turn.tell === "closed" : runtime.next.closed) return "closed";
  return runtime.editingAfterCompact ? "editing" : null;
}

/** 送信待ちの様子（チャットの詳細・SSE・送信待ちを変える API の応答で同じ形） */
export function queueStateOf(runtime: ChatRuntime): QueueState {
  const { later, stops, now } = runtime.outbox;
  const paused = runtime.queuePaused;
  const head = later[0];
  return { messages: later, paused, stops, waiting_edit: runtime.waitingEdit, now, waiting: head ? waitingOf(runtime, head) : null, reserved: head && !paused && stops[0] !== 0 ? queueActionOf(head) : null, sending: [] };
}

/** 送信待ちの頭が待っている理由（送る順が来ていれば null） */
function waitingOf(runtime: ChatRuntime, head: QueueState["messages"][number]): QueueState["waiting"] {
  const handoff = runtime.handoff();
  if (runtime.busy) return "busy";
  if (runtime.gates.recovery !== null) return "recovery";
  if (runtime.outbox.paused || runtime.outbox.stops[0] === 0) return "paused";
  if (runtime.state.resume?.queued) return "hold";
  if (handoff && (handoff.state !== "ready" || isQueueAction(head))) return "handoff";
  return runtime.waitingEdit ? "editing" : null;
}

/** 作業の種類（手で圧縮する実行・その前の圧縮前指示・圧縮後指示の作業・ふつうの指示） */
export function turnKindOf(item: TurnRequest, runtime: ChatRuntime): TurnKind {
  return item.compact ? "compact" : item.thenCompact ? "pre_compact" : runtime.next.compaction.done ? "post_compact" : "message";
}

/** 手で圧縮する実行（きっかけを省けば手で）・その前の圧縮前指示のきっかけ（ほかの作業は null） */
export function compactByOf(item: TurnRequest): CompactTrigger | null {
  return item.compact ? (item.compactTrigger ?? "manual") : item.thenCompact ? "manual" : null;
}

// 1 回の作業の状態（TurnState）と、作業していない間に次の作業へ持ち越す印・画面に配る形 liveOf（ChatRuntime から作る）
import type { ProviderCallbacks } from "@/features/ai/core/index";
import { reconnectStateOf } from "@/features/chat/core/run/machine/recoveryState";
import type { Compaction, TellGate, TurnKind } from "@/features/chat/core/run/machine/types";
import type { ApiRetryInfo, BackgroundState } from "@shared/ai/turnEvents";
import type { ChatLive } from "@shared/chat/chatLive";
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

/** 画面に配る形（チャットの詳細の live。SSE の chat_live と同じ形） */
export function liveOf(runtime: ChatRuntime): ChatLive {
  const { turn, state, compaction } = runtime;
  return {
    queue: runtime.queueState(),
    background: turn?.background ?? null,
    retry: turn?.retry ?? null,
    reconnect: reconnectStateOf(runtime.recovery),
    compacting: compaction.running,
    stopping: turn ? turn.stopRequested : runtime.next.stopRequested,
    drawing_visual: turn?.drawingVisual ?? false,
    after_compact: state.afterCompact,
    awaiting_compact: compaction.awaiting,
    compact_after_turn: compaction.afterTurn,
    compacted_turn: compaction.done,
    tells_closed: runtime.tellsClosed,
    inheriting: state.inheriting,
    restart_resume: state.resume,
    workplace_move: state.workplaceMove,
  };
}

/** 作業の種類（手で圧縮する実行・その前の圧縮前指示・圧縮後指示の作業・ふつうの指示） */
export function turnKindOf(item: TurnRequest, runtime: ChatRuntime): TurnKind {
  return item.compact ? "compact" : item.thenCompact ? "pre_compact" : runtime.next.compaction.done ? "post_compact" : "message";
}

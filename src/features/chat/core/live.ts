// 画面に配る作業中の様子 liveOf と送信待ちの様子 queueStateOf（チャットの詳細の live・SSE の chat_live・送信待ちを変える API の応答で同じ形）
import { reconnectStateOf } from "@/features/chat/core/run/machine/recovery";
import { holdOf, isBusy, noCompaction, queuePaused, turnOf, waitingEdit } from "@/features/chat/core/run/machine/state";
import type { ChatRunState } from "@/features/chat/core/run/machine/types";
import type { ChatLive, QueueState, WorkPhase } from "@shared/chat/chatLive";
import { isQueueAction, queueActionOf } from "@shared/chat/queueActions";
import type { ChatRun } from "@/features/chat/core/run/chatRun";

/** 画面に配る形。古い欄（after_compact・awaiting_compact…）も同じ状態から作る */
export function liveOf(runtime: ChatRun): ChatLive {
  const s = runtime.run;
  const { phase: p } = s;
  const turn = turnOf(s);
  const compaction = turn?.compaction ?? noCompaction();
  const phase = phaseOf(s);
  const { background, retry, drawingVisual } = runtime.display;
  const move = runtime.workplaceMove;
  return {
    queue: queueStateOf(runtime),
    background,
    retry,
    reconnect: reconnectStateOf(s.gates.recovery),
    compacting: compaction.running,
    stopping: p.kind === "idle" ? false : p.stopRequested,
    drawing_visual: drawingVisual,
    after_compact: s.outbox.now,
    awaiting_compact: compaction.awaiting,
    compact_after_turn: compaction.afterTurn,
    compacted_turn: compaction.done,
    tells_closed: turn?.tell === "closed",
    inheriting: p.kind === "preparing" && p.why === "inherit",
    restart_resume: s.gates.restart,
    workplace_move: move,
    phase,
    status: runtime.chatStatus,
    provider_handoff: runtime.handoff(),
    preparing_for: p.kind === "preparing" ? p.why : null,
    compact_by: phase === "awaiting_compact" ? (turn?.compactBy ?? (compaction.afterTurn ? "manual" : "auto")) : null,
    hold: holdOf(s),
    now: s.outbox.now,
    turn_end: move ? [{ kind: "workplace_move", label: move.label }] : [],
  };
}

/** 作業の段階（作業していない / 送る準備 / 圧縮中 / 圧縮前指示から圧縮が終わるまで / 圧縮したやり取りの途中 / ふつうの作業）。重なったら前のものを出す */
function phaseOf(s: ChatRunState): WorkPhase {
  const turn = turnOf(s);
  if (!turn) return s.phase.kind === "preparing" ? "preparing" : "idle";
  const { running, awaiting, done } = turn.compaction;
  return running ? "compacting" : awaiting ? "awaiting_compact" : done ? "compacted" : "running";
}

/** 送信待ちの様子 */
export function queueStateOf(runtime: ChatRun): QueueState {
  const s = runtime.run;
  const { later, stops, now } = s.outbox;
  const paused = queuePaused(s);
  const head = later[0];
  return { messages: later, paused, stops, waiting_edit: waitingEdit(s), now, waiting: head ? waitingOf(runtime, head) : null, reserved: head && !paused && stops[0] !== 0 ? queueActionOf(head) : null, sending: [] };
}

/** 送信待ちの頭が待っている理由（送る順が来ていれば null） */
function waitingOf(runtime: ChatRun, head: QueueState["messages"][number]): QueueState["waiting"] {
  const s = runtime.run;
  const handoff = runtime.handoff();
  if (isBusy(s)) return "busy";
  if (s.gates.recovery?.holds) return "recovery";
  if (s.outbox.paused || s.outbox.stops[0] === 0) return "paused";
  if (s.gates.restart?.queued) return "hold";
  if (handoff && (handoff.state !== "ready" || isQueueAction(head))) return "handoff";
  return waitingEdit(s) ? "editing" : null;
}

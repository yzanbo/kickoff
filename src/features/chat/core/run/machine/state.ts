// 実行の状態から導く印（純粋）: 作業中か・「いま」を預かる理由・送信待ちを止めているか・書き直しを待っているか・足すところか
import { isQueueAction } from "@shared/chat/queueActions";
import { EMPTY_OUTBOX, restoreOutbox, type Outbox } from "@shared/chat/outbox";
import type { HoldReason } from "@shared/chat/chatLive";
import type { QueuedMessage } from "@shared/chat/types";
import type { ChatRunState, Compaction, HandoffGate, Phase, TurnKind, TurnPhase } from "./types";

export const noCompaction = (): Compaction => ({ awaiting: false, afterTurn: false, running: null, done: false });

/** 作業していない状態（保存した出す箱を読み戻すときは restoreOutbox の形で） */
export function initialRunState(saved: Outbox | null = null): ChatRunState {
  return { phase: { kind: "idle" }, outbox: saved ? restoreOutbox(saved) : EMPTY_OUTBOX, editing: { now: [], later: [] }, gates: { recovery: null, restart: null } };
}

/** 作業中の段階（作業していなければ null） */
export const turnOf = (s: ChatRunState): TurnPhase | null => (s.phase.kind === "turn" ? s.phase : null);

/** 作業中か（動かしている・送る準備をしている） */
export const isBusy = (s: ChatRunState): boolean => s.phase.kind !== "idle";

/** AI の交代の準備中か（送信待ちを取り出さない・「いま」を送らせない） */
export const isSwitching = (p: Phase): boolean => p.kind === "preparing" && (p.why === "switch_provider" || p.why === "handoff_retry");

/** 圧縮中か、圧縮前指示を送ってから圧縮が終わるまでか */
export const compactPhase = (c: Compaction): boolean => c.running !== null || c.awaiting;

/** 作業を始めるときの圧縮の様子（手で圧縮する前の指示・手で圧縮する実行は待つ間、圧縮後指示の作業は圧縮したやり取りの途中） */
export function compactionAtStart(turn: TurnKind): Compaction {
  return { ...noCompaction(), awaiting: turn === "pre_compact" || turn === "compact", done: turn === "post_compact" };
}

/**
 * 引き継ぎの門が通すか（row を省けば、送ること自体）: 門がなければ通す。圧縮・消去の行は引き継ぎが終わるまで通さない
 * （引き継ぐ前にセッションを操作しない）。指示は引き継ぎの準備ができていれば通す
 */
export function handoffAllows(gate: HandoffGate, row?: QueuedMessage): boolean {
  if (gate === null) return true;
  if (row && isQueueAction(row)) return false;
  return gate === "ready";
}

/**
 * 「いま」を預かる理由（預からなければ null。預かる場面を足したらここに足す）:
 * 親の会話を写している（動かし始めたらその作業に伝える）/ 圧縮中か、圧縮前指示を送ってから圧縮が終わるまで（圧縮前指示の作業に混ざり、
 * 画面では圧縮より上に出て、要約したあとの会話に入ったかも分からないため）/ 圧縮したやり取りの途中（圧縮後指示のやり取りに混ざるため）/
 * いまの作業に足せなくなったあと（先に預かった指示より先に入らないように）/ 預かった指示を書き直している（その指示より先に入らないように）
 */
export function holdOf(s: ChatRunState): HoldReason | null {
  const { phase } = s;
  if (phase.kind === "preparing" && phase.why === "inherit") return "inherit";
  if (phase.kind === "turn") {
    if (compactPhase(phase.compaction)) return "compact";
    if (phase.compaction.done) return "exchange";
    if (phase.tell === "closed") return "closed";
  }
  return s.outbox.now.some((m) => s.editing.now.includes(m.id)) ? "editing" : null;
}

/** 送信待ちを送らずに止めているか（利用者が止めた・Kickoff が門で止めた。画面の「止めています」） */
export function queuePaused(s: ChatRunState): boolean {
  return s.outbox.paused || (s.gates.recovery !== null && s.outbox.later.length > 0);
}

/** 送信待ちの次の指示を画面で書き直しているので、送らずに書き直しが終わるのを待っている（作業は終わり、送る準備ができている） */
export function waitingEdit(s: ChatRunState): boolean {
  const head = s.outbox.later[0];
  return !isBusy(s) && !s.gates.restart?.queued && head !== undefined && !queuePaused(s) && s.editing.later.includes(head.id);
}

/**
 * その「いま」を、いまの作業（送る準備の途中ならこれから動かす作業）に足すところか（預かる理由がなく、口ができるのを待っている・足している途中）。
 * 足すところでなくなったら、預かったことになる（作業の終わりに送信待ちより先に送る）
 */
export function isTellPending(s: ChatRunState, id: string): boolean {
  if (!s.outbox.now.some((m) => m.id === id)) return false;
  const { phase } = s;
  if (phase.kind === "preparing") return phase.why === "send";
  return phase.kind === "turn" && (phase.tell === "opening" || phase.tell === "open") && holdOf(s) === null;
}

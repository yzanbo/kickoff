// チャットの実行の振る舞いの表（筋書き）の形。表は純粋なデータで、いまの Runner と、作り直したあとの状態機械の両方に同じ表を流す。
// 行は 01 の 8 章（保たなければならない振る舞い）の番号を持ち、外から見えるもの（AI に送った指示・記録・送信待ち・作業中の様子・API の状態コード）だけを比べる
import type { AgentEvent } from "@shared/ai/turnEvents";
import type { ChatStatus, QueueAction } from "@shared/chat/types";
import type { RestartResumeAction } from "@shared/chat/chatLive";

/** 筋書きの中のチャットの呼び名（a が既定） */
export type ChatAlias = "a" | "b" | "c";

/**
 * 実行の終わり方。usage_limit は枠が戻る時刻（筋書きの時計の始まりからの ms。null は分からない）
 */
export type Outcome = "completed" | "failed" | "cancelled" | "network" | { usage_limit: number | null };

/** 出来事のあとに待つもの: turn = 次の実行が始まる / idle = 作業中でなくなる / settled = そのどちらか */
export type Then = "turn" | "idle" | "settled";

/** 送信待ち・預かりの行は文で指す（圧縮・消去の行は [圧縮]・[消去]） */
export type Row = string;

/** 送信待ちだけを変える操作（作り直したあとの QueueCommand と同じ名前。行は文で指す） */
export type ScenarioQueueCommand =
  | { op: "add_action"; action: QueueAction; after: Row | null }
  /** 送信待ち（later）か預かり（now）のどちらかにある行を消す */
  | { op: "remove"; rows: Row[] }
  | { op: "edit"; row: Row; text: string }
  | { op: "move"; rows: Row[]; to: "top" | "bottom" | { index: number } | { before: Row | null } }
  | { op: "merge"; rows: Row[] }
  | { op: "set_stops"; stops: number[] }
  | { op: "stop_after"; row: Row | null; stop: boolean }
  | { op: "set_paused"; paused: boolean }
  | { op: "clear" };

/** 発言の印（依頼文の頼み・子チャットから渡した依頼） */
export type ScenarioMarks = { handoff_request?: true; handoff_from?: { chat_id: number; title: string } };

/** 筋書きの 1 歩。利用者の出来事（RunEvent と同じ名前。HTTP の口を通す）・偽のプロバイダーの出来事・時計と通信・起動し直し・待つ / 確かめる */
export type ScenarioStep =
  | { do: "start"; text: string; chat?: ChatAlias; then?: Then }
  /** idle = 作業中なら 409 の送る口（いまの POST /messages）。now = 止めずに伝える。later = 送信待ちに入れる */
  | { do: "send"; when: "idle" | "now" | "later"; text: string; chat?: ChatAlias; pauseAfter?: boolean; hold?: boolean; marks?: ScenarioMarks; result?: "told" | "held" | "sent" | "queued"; status?: number; then?: Then }
  | { do: "queue"; command: ScenarioQueueCommand; chat?: ChatAlias; status?: number; then?: Then }
  | { do: "queue_send"; mode: "now" | "all" | "in_order"; rows?: Row[]; chat?: ChatAlias; status?: number; then?: Then }
  | { do: "editing"; lane: "now" | "later"; rows: Row[]; chat?: ChatAlias; then?: Then }
  | { do: "cancel" | "compact" | "clear" | "seen" | "stop_reconnect"; chat?: ChatAlias; status?: number; then?: Then }
  | { do: "archive"; archived: boolean; chat?: ChatAlias }
  | { do: "answer_restart"; decisions: [ChatAlias, RestartResumeAction][]; status?: number; then?: Then }
  | { do: "answer_recovery"; allow: boolean; chat?: ChatAlias; then?: Then }
  /** 承認・質問のカードに答える（もう待っていなければ 409） */
  | { do: "answer_approval"; kind: "permission" | "question"; allow: boolean; chat?: ChatAlias; status?: number; then?: Then }
  | { do: "settings"; patch: ScenarioSettings }
  /** いま動いている実行（chat の最後の実行）に。tellReady = 足す口ができた / tellLate = 次からの実行は tellReady まで口を作らない */
  | { provider: "tellReady"; chat?: ChatAlias }
  | { provider: "tellLate" }
  /** 圧縮した作業の終わりの会話記録の乗り換えを止めておく（hold）・進める（乗り換えるものはない = null） */
  | { provider: "trim"; hold: boolean }
  /** 足せるか（入力が閉じたら false。次からの実行にも残る） */
  | { provider: "tell"; ok: boolean }
  | { provider: "compacting"; active: boolean; chat?: ChatAlias }
  /** 要約が済んだ（圧縮の記録を残してから圧縮中を外す） */
  | { provider: "compacted"; chat?: ChatAlias }
  | { provider: "compactFailed"; reason: string; chat?: ChatAlias }
  | { provider: "emit"; events: AgentEvent[]; chat?: ChatAlias }
  /** 自動の圧縮の前の指示を足した（渡されていない実行では筋書きの誤り） */
  | { provider: "preCompactInjected"; chat?: ChatAlias }
  | { provider: "ask"; kind: "permission" | "question"; chat?: ChatAlias }
  /** AI の操作ツールを呼ぶ */
  | { provider: "tool"; name: string; args: Record<string, unknown>; chat?: ChatAlias }
  | { provider: "end"; outcome: Outcome; session?: null; context?: { tokens: number; window: number }; chat?: ChatAlias; then?: Then }
  /** 時計を進める（枠の戻りを見る時計・書き直しの持ち時間） */
  | { clock: "advance"; ms: number; then?: Then; chat?: ChatAlias }
  | { net: "online" | "offline"; then?: Then; chat?: ChatAlias }
  /** アプリを終えて起動し直す（作業中の実行は止まり、保存したものだけが残る） */
  | { restart: true }
  /** 並べた出来事を同時に起こす（先に書いたものから始める。配列はその中を順に） */
  | { parallel: (ScenarioStep | ScenarioStep[])[] }
  /** ほかの処理に順を渡す（時間では待たない） */
  | { yield: number }
  /** 画面に出ない段取り（預かりを配る途中など）が落ち着くまで待つ */
  | { settle: true; chat?: ChatAlias }
  | { await: ScenarioExpect }
  | { check: ScenarioExpect };

/** 作業中の様子のうち比べるもの（compacting は始めた時刻を出てきた順の t1・t2… に置き換える） */
export interface LiveExpect {
  tells_closed?: boolean;
  awaiting_compact?: boolean;
  compact_after_turn?: boolean;
  compacted_turn?: boolean;
  compacting?: { trigger: "auto" | "manual"; since: string } | null;
  stopping?: boolean;
  restart_resume?: { interrupted: boolean; queued: boolean } | null;
  reconnect?: { attempts: number; agents: string[] } | null;
  workplace_move?: boolean;
}

/** 外から見えるもの（書いた欄だけを比べる。chat を省けば a） */
export interface ScenarioExpect {
  chat?: ChatAlias;
  /** AI に送った指示（新しい実行）の列。定型文は 前:・後:・[再開] などに置き換える */
  runs?: string[];
  /** 作業中に足した発言の列 */
  told?: string[];
  /** 実行ごとに渡した、自動の圧縮の前の指示（自動前:<文> か null） */
  preCompacts?: (string | null)[];
  /** 実行ごとに続きから再開した会話 */
  sessions?: (string | null)[];
  /** 同時に動いていた実行の数の最大 */
  concurrent?: number;
  /** 記録の自分の発言（札は 前:・後:、印は #依頼・#from<チャット>・#続き） */
  users?: string[];
  /** 記録の種類の列 */
  events?: string[];
  /** お知らせ・失敗の記録（書いた文を含む。順に） */
  notices?: string[];
  errors?: string[];
  /** 圧縮の記録のきっかけ */
  compacts?: ("auto" | "manual")[];
  /** 送信待ち（later）の行・線・止めているか・書き直しを待っているか */
  queue?: Row[];
  stops?: number[];
  paused?: boolean;
  waitingEdit?: boolean;
  /** 預かり（now。いまの after_compact）。圧縮後指示は 後: */
  held?: Row[];
  live?: LiveExpect;
  /** worktree は作業場所のフォルダの名前（本体なら null） */
  status?: ChatStatus;
  unread?: boolean;
  session?: string | null;
  turns?: number;
  worktree?: string | null;
  busy?: boolean;
  /** 回答待ちのカードの種類 */
  asks?: string[];
  /** 承認・質問のカードに AI が受け取った答え */
  answers?: string[];
  /** 起動したときの再開の確かめ（GET /api/restart-resumes） */
  restartResumes?: { chat: ChatAlias; interrupted: boolean; queued: boolean; messages: Row[] }[];
}

/** 筋書きの前に入れる設定 */
export interface ScenarioSettings {
  pre_compact_prompt?: string | null;
  post_compact_prompt?: string | null;
  auto_resume_on_reconnect?: boolean;
}

export interface Scenario {
  /** S01… */
  id: string;
  /** 01 の 8 章の番号 */
  behavior: number;
  /** いまのテストの名前を写したもの */
  name: string;
  settings?: ScenarioSettings;
  /** 本体に Git の最初のコミットを作る（作業場所を移す筋書き） */
  git?: boolean;
  /** いまの Runner の不具合（6 章の番号）。正しい振る舞いを書き、いまは落ちることを確かめる（直すのは別の fix） */
  known?: string;
  steps: ScenarioStep[];
  /** 最後に、すべての作業が終わってから確かめる */
  expect: ScenarioExpect;
}

// ---- 筋書きの世界の決まった値 ----

/** 筋書きの時計の始まり（枠の戻る時刻はここからの ms で書く） */
export const T0 = Date.parse("2026-11-04T09:00:00.000Z");
/** チャットごとの会話の ID（圧縮の実行がどのチャットのものかを、続きから再開した会話で見分ける） */
export const SESSIONS: Record<ChatAlias, string> = { a: "s1", b: "s2", c: "s3" };

// ---- 表を短く書く小物（どれも同じ形のデータを返すだけ） ----

export const start = (text: string, then: Then = "turn", chat?: ChatAlias): ScenarioStep => ({ do: "start", text, then, ...(chat ? { chat } : {}) });
export const now = (text: string, result: "told" | "held" | "sent", extra: Partial<Extract<ScenarioStep, { do: "send" }>> = {}): ScenarioStep => ({ do: "send", when: "now", text, result, ...extra });
export const later = (text: string, extra: Partial<Extract<ScenarioStep, { do: "send" }>> = {}): ScenarioStep => ({ do: "send", when: "later", text, ...extra });
export const send = (text: string, extra: Partial<Extract<ScenarioStep, { do: "send" }>> = {}): ScenarioStep => ({ do: "send", when: "idle", text, then: "turn", ...extra });
export const end = (outcome: Outcome, then?: Then, extra: Partial<Extract<ScenarioStep, { provider: "end" }>> = {}): ScenarioStep => ({ provider: "end", outcome, ...(then ? { then } : {}), ...extra });
export const queue = (command: ScenarioQueueCommand, extra: Partial<Extract<ScenarioStep, { do: "queue" }>> = {}): ScenarioStep => ({ do: "queue", command, ...extra });

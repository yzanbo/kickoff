// チャットの実行の状態の型（純粋。Node・店・時計を読まない）。作業ごとの状態 TurnState の中身の言葉
import type { CompactTrigger } from "@shared/ai/turnEvents";
import type { HandoffState } from "@shared/chat/chatLive";
import type { Outbox } from "@shared/chat/outbox";

/** 作業の種類（ふつうの指示・手で圧縮する前の圧縮前指示・手で圧縮する実行・圧縮後指示の作業・再開） */
export type TurnKind = "message" | "pre_compact" | "compact" | "post_compact" | "resume";

/** いまの作業に「いま」を足す口: まだ / 足せる / 入力が閉じた（作業が終わるまで預かる）/ 手で圧縮する実行（足さない） */
export type TellGate = "opening" | "open" | "closed" | "never";

/**
 * 作業の中の圧縮の様子。圧縮前指示から圧縮が終わるまで・作業中に手で頼んだ圧縮・圧縮中・圧縮したやり取りの途中は、
 * 同じ作業の中で重なることがある（手で圧縮する実行は待つ間と圧縮中と圧縮したあとが重なり、自動の圧縮が失敗すると待つ間と圧縮したあとが重なる）ので、
 * 1 つの段階にせず並べて持つ
 */
export interface Compaction {
  /** 圧縮前指示を送ってから、圧縮が終わるまで（最後まで終わってまだ圧縮していなければ、続けて圧縮する） */
  awaiting: boolean;
  /** 作業中に手で頼んだ圧縮の圧縮前指示を足した（この作業が最後まで終わったら、手で頼んだ圧縮として圧縮する） */
  afterTurn: boolean;
  /** 圧縮中（始めた時刻は終わるまで変えない） */
  running: { since: string; trigger: CompactTrigger } | null;
  /** 圧縮したやり取りの途中（この間の「いま」は預かる） */
  done: boolean;
}

/** AI の切り替えの引き継ぎの門（DB の写し。null = 引き継ぎなし。状態は @shared/chat/chatLive の HandoffState） */
export type HandoffGate = null | HandoffState;

/** 1 回の実行の終わり方（Runner が次に何をするかを決める） */
export interface TurnOutcome {
  status: "completed" | "failed" | "cancelled";
  /** 通信の切断で失敗した（つながったら自動で再開する） */
  network: boolean;
  /** 通信の切断で止まったサブエージェント（再開するときに、続きから再開するよう頼む） */
  stoppedAgents?: StoppedAgent[];
  /** 使用枠の上限で止まった（枠が戻ったら、続けるかを聞く。resetsAt: 戻る時刻。分からなければ null） */
  usageLimit?: { resetsAt: string | null };
}

/** 通信の切断で止まったサブエージェント（SendMessage の宛先と名前） */
export interface StoppedAgent {
  agentId: string;
  description: string;
}

/**
 * 作業の段階（作業の終わりの決まりで使う分。送る準備・口・止めるの欄は、送る・伝えるを step に乗せる単位で足す）:
 * 作業していない / 作業中（種類と圧縮の様子）/ 作業の終わりにすること（予約した作業場所の移動）が済むのを待つ（済んだら then のとおりに続ける）
 */
export type Phase = { kind: "idle" } | { kind: "turn"; turn: TurnKind; compaction: Compaction } | { kind: "settling"; task: "workplace_move"; then: AfterTurn };

/** 作業の終わりのあとに続けること（続けて圧縮するならそのきっかけ・預かりと送信待ちを送ってよいか） */
export interface AfterTurn {
  compact: CompactTrigger | null;
  send: boolean;
}

/** チャットの実行の状態（いまは作業の終わりの決まりに渡す分。ChatRuntime から写し、返ったものを書き戻す） */
export interface ChatRunState {
  phase: Phase;
  outbox: Outbox;
  gates: { handoff: HandoffGate };
  /** 作業していない間に持ち越す、圧縮前指示から圧縮が終わるまでの間（続けて圧縮するときだけ残す） */
  awaitingCompact: boolean;
}

/** 読むだけの入力 */
export interface Env {
  shuttingDown: boolean;
  /** 作業の終わりにすること（AI が予約した作業場所の移動）があるか */
  hasTurnEndTasks: boolean;
}

/** 命令（殻の Runner が実行する）。中間の姿の命令（end_recovery・deliver_held・send_next）は、再開・送る・伝えるを step に乗せる単位で置き換える */
export type Effect =
  /** 止まったあとの再開の段取り（いまの ChatRecovery.finished。送信待ちを止める・戻す・待つ・聞く） */
  | { do: "end_recovery"; outcome: TurnOutcome }
  | { do: "refresh_usage" }
  /** 作業の終わりにすることを行う（済んだら onSettled で続ける） */
  | { do: "run_turn_end_tasks" }
  /** 作業の終わりにすることの予約を消す（notice: 移さなかったお知らせを残す） */
  | { do: "drop_turn_end_tasks"; notice: boolean }
  | { do: "start_turn"; turn: "compact"; trigger: CompactTrigger }
  /** 預かった「いま」を送信待ちより先に送る（sendNow でなければ送信待ちの頭へ置く） */
  | { do: "deliver_held"; sendNow: boolean }
  | { do: "send_next" };

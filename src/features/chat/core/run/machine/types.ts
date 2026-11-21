// チャットの実行の状態・出来事・命令の型（純粋。Node・店・時計を読まない）。出来事を受けて次の状態と命令を返すのは step.ts
import type { CompactTrigger } from "@shared/ai/turnEvents";
import type { HandoffState, PrepareReason, RestartResumeAction, RestartResumeState } from "@shared/chat/chatLive";
import type { MessageMarks } from "@shared/chat/chatEvent";
import type { Outbox } from "@shared/chat/outbox";
import type { QueueCommand } from "@shared/chat/queueCommand";
import type { Attachment, ChatOptionsPatch, QueuedMessage } from "@shared/chat/types";

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

/** 1 回の実行の終わり方（次に何をするかを決める） */
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
 * 作業の段階: 作業していない / 送る準備（理由。確かめてから動かし始めるまで・長い準備の間）/ 作業中（種類・「いま」を足す口・圧縮の様子・
 * 止めるよう頼んだか・足している途中の行）。作業の終わりにすること（予約した作業場所の移動）は、まだ段階にしない（殻が済んだら settled を渡す）
 */
export type Phase =
  | { kind: "idle" }
  | { kind: "preparing"; why: PrepareReason; stopRequested: boolean }
  | { kind: "turn"; id: string; turn: TurnKind; tell: TellGate; compaction: Compaction; stopRequested: boolean; telling: string | null; compactBy: CompactTrigger | null };

/** 作業中の段階 */
export type TurnPhase = Extract<Phase, { kind: "turn" }>;

/** 出す箱の列（now = 預かり、later = 送信待ち） */
export type Lane = "now" | "later";

/** 待つ条件: つながる（AI の API に届く）・時計がその時刻（ミリ秒）を過ぎる */
export type WaitFor = { kind: "online" } | { kind: "clock"; at: number };

/**
 * 止まったあとの再開の段取り（通信の切断・使用枠の上限。決まりは recovery.ts）。止まった理由に関係なく 1 つで持つので、続けて別の理由で止まっても、
 * 止めた送信待ちを引き継ぐ。保存しない（アプリを終えたら外れ、起動したときの確かめで聞く）
 */
export interface RecoveryGate {
  reason: "reconnect" | "usage_limit";
  /** Kickoff が送信待ちを止めている（利用者が止めていたものは含めない。送信待ちが空になったら外れる） */
  holds: boolean;
  /** 段: 条件を待つ（満たしたら再開する・聞く）/ 枠の戻る時刻を調べている / 聞いている / 再開の指示を送っている / 何もしない（お知らせだけ） */
  step: { at: "wait"; for: WaitFor; then: "resume" | "ask" } | { at: "lookup" } | { at: "asking" } | { at: "resuming" } | { at: "idle" };
  /** 続けて自動で再開した回数（通信の切断が続いている間だけ数える） */
  attempts: number;
  /** 通信の切断で止まり、まだ再開を頼んでいないサブエージェント（作業 ID → 名前。通信の切断が続いている間だけ覚える） */
  agents: Record<string, string>;
}

/** 送信待ちを自動で送らない、Kickoff の理由（門。outbox.paused = 利用者が止めた、とは分けて持ち、保存しない） */
export interface Gates {
  /** 止まったあとの再開の段取り（送信待ちを止めているのは holds のとき） */
  recovery: RecoveryGate | null;
  /** 起動したときの再開の確かめを待っている（答えるまで続けない・送信待ちを送らない） */
  restart: RestartResumeState | null;
}

/** 1 つのチャットの実行の状態（保存するのは出す箱だけ） */
export interface ChatRunState {
  phase: Phase;
  outbox: Outbox;
  /** 画面で書き直している行（列ごと。送る順が来ても、書き直しが終わるまでその行から後ろは送らない） */
  editing: Record<Lane, string[]>;
  gates: Gates;
}

/** 作業の終わりのあとに続けること（続けて圧縮するならそのきっかけ・預かりと送信待ちを送ってよいか） */
export interface AfterTurn {
  compact: CompactTrigger | null;
  send: boolean;
}

/** 読むだけの入力（時刻と ID も外から渡す） */
export interface Env {
  now: string;
  newId: () => string;
  /** アプリを終えるところ（預かり・送信待ちを送らない） */
  shuttingDown: boolean;
  /** 会話がある（chats.session_id） */
  hasSession: boolean;
  /** 作業の終わりにすること（AI が予約した作業場所の移動）があるか */
  hasTurnEndTasks: boolean;
  /** AI の切り替えの引き継ぎの門 */
  handoff: HandoffGate;
  /** 引き継ぎで選択を戻す送信待ちの行（AI を切り替えた記録の queued_ids。なければ空） */
  handoffQueued: readonly string[];
  /** 圧縮前指示（設定・プロジェクト。なければ null） */
  preCompact: string | null;
  /** 前の圧縮・消去のあとで、もう圧縮前指示を送ったか（記録から導く） */
  preCompactSent: boolean;
  /** 通信が切れて止まったら、つながったときに自動で再開する（設定） */
  autoResumeOnReconnect: boolean;
  /** チャットが失敗で止まったままか（自分で動かしていれば、再開しない・聞かない） */
  chatFailed: boolean;
}

/** 送る指示 */
export interface NewSend {
  text: string;
  options: ChatOptionsPatch;
  attachments: Attachment[];
  marks: MessageMarks;
}

/** 出来事（利用者・API・プロバイダー・殻から。1 件ずつ step に渡す） */
export type RunEvent =
  /** 送る（idle = 作業中なら 409、now = 作業中なら止めずに伝える、later = 作業中なら送信待ちに入れる。hold なら作業していなくても入れる） */
  | { type: "send"; when: "idle" | "now" | "later"; message: NewSend; pauseAfter?: boolean; hold?: boolean }
  /** 列を変える（applyQueueCommand。now の行は預かりの書き直し・取り消し） */
  | { type: "queue"; command: QueueCommand }
  | { type: "queue_send"; mode: "now"; id: string }
  | { type: "queue_send"; mode: "all"; ids?: string[] }
  | { type: "queue_send"; mode: "in_order" }
  | { type: "editing"; lane: Lane; ids: string[] }
  | { type: "edit_hold_expired"; lane: Lane }
  | { type: "cancel" }
  | { type: "compact" }
  /** コンテキストを消去する（作業中なら予約。pump なら、消したあと送信待ちの次を送る） */
  | { type: "clear"; pump: boolean }
  /** 長い準備を始める・済んだ（next: 済んだあとに送信待ちの次を送る / 預かりの頭を送る） */
  | { type: "begin"; why: PrepareReason }
  | { type: "prepared"; next?: "send_next" | "deliver" }
  /** 殻が作業を動かし始めた（pauseAfter: 質問として送った指示の作業） */
  | { type: "turn_started"; turn: TurnKind; compactBy: CompactTrigger | null; pauseAfter?: boolean }
  /** プロバイダーの「いま」を足す口ができた・なくなった */
  | { type: "tell_ready"; ready: boolean }
  /** 足した結果（drop: 文を組み立てられなかったので行を外す） */
  | { type: "tell_result"; id: string; ok: boolean; drop?: boolean }
  /** 作業中に手で頼んだ圧縮の圧縮前指示を、いまの作業に足せたか */
  | { type: "pre_compact_told"; ok: boolean }
  | { type: "compacting"; active: boolean; at: string; trigger: CompactTrigger }
  /** 圧縮した（記録を残したあと。post: 圧縮後指示の文、compactRun: 手で圧縮する実行の中） */
  | { type: "compacted"; post: string | null; compactRun: boolean }
  | { type: "pre_compact_injected" }
  | { type: "turn_ended"; outcome: TurnOutcome }
  /** 作業の終わりにすること（予約した作業場所の移動）が済んだ（then: 作業の終わりに決めた続き） */
  | { type: "settled"; then: AfterTurn }
  /** AI が予約した作業場所の移動のあとの続きの指示を置く（止めていれば送信待ちの頭） */
  | { type: "continuation"; text: string; afterFinish: boolean }
  /** 送信待ちの次を送る */
  | { type: "send_next" }
  /** 再開の段取り: つながった・時計（ミリ秒）・枠の戻る時刻が分かった・再開するかに答えた・自動で再開しない・自分で送った・再開の指示を送り終えた */
  | { type: "online" }
  | { type: "clock"; now: number }
  | { type: "limit_found"; at: string | null }
  | { type: "answer_recovery"; allow: boolean }
  | { type: "stop_reconnect" }
  | { type: "forget_recovery" }
  | { type: "recovery_resumed" }
  /** 起動したときの確かめ: 自分で送った（作業を続けるかはもう聞かない）・答えた（agents: 続けるときに再開を頼む、止まったサブエージェント） */
  | { type: "forget_interrupted" }
  | { type: "answer_restart"; action: RestartResumeAction; agents: { agentId: string | null; description: string }[] }
  /** 門を変える（起動したときの確かめ・止まったあとの再開の段取り） */
  | { type: "gates"; patch: Partial<Gates> }
  /** 止めておくかだけを変える（AI の切り替えに失敗した・起動したときの確かめに「止めておく」と答えた） */
  | { type: "set_paused"; paused: boolean };

/** 送るの答え（sent = すぐ送った、held = 預かった、queued = 送信待ちに入れた、pending = いまの作業に足すところ。殻が足した結果で told / held にする） */
export type SendReply = "sent" | "held" | "queued" | "pending";

/** 命令（殻の Runner が実行する） */
export type Effect =
  /** 作業を動かす（指示の文を組み、発言を記録して動かす。from: 失敗したときに理由を残す先） */
  | { do: "start_turn"; turn: TurnKind; item: QueuedMessage | null; trigger?: CompactTrigger; text?: string; pauseAfter?: boolean; from: "user" | "queue" | "held" }
  /** いまの作業に行を足す（結果は tell_result で戻す） */
  | { do: "tell"; turnId: string; item: QueuedMessage }
  /** 作業中に手で頼んだ圧縮の圧縮前指示を、いまの作業に足す（結果は pre_compact_told で戻す） */
  | { do: "tell_pre_compact"; text: string }
  | { do: "abort_turn" }
  /** コンテキストを消去する（セッションを外して区切りを残す） */
  | { do: "clear_session" }
  /** 書き直しの持ち時間の待ち（on: 数え直す） */
  | { do: "edit_timer"; lane: Lane; on: boolean }
  | { do: "record"; kind: "notice" | "error"; message: string }
  | { do: "reply"; result: SendReply; id: string | null }
  | { do: "reject"; status: 400 | 404 | 409; message: string }
  | { do: "refresh_usage" }
  /** 再開の条件を見張る（つながったか・時計。満たしたら online / clock を渡す） */
  | { do: "watch"; what: WaitFor["kind"] }
  /** 再開するかを聞く（承認のカードと同じ回答待ち。答えは answer_recovery）・聞くのを取り下げる */
  | { do: "ask_recovery"; reason: RecoveryGate["reason"]; title: string; description: string; input: Record<string, unknown> }
  | { do: "withdraw_ask" }
  /** 再開の指示を送る（送り終えたら recovery_resumed） */
  | { do: "resume_recovery"; reason: RecoveryGate["reason"]; agents: StoppedAgent[] }
  /** チャットの AI の使い切った枠の戻る時刻を調べる（答えは limit_found） */
  | { do: "lookup_limit" }
  /** 起動したときの再開の確かめの印（chats.resume_pending）を変える */
  | { do: "resume_pending"; value: boolean }
  /** 作業の終わりにすることを行う（済んだら settled で続ける） */
  | { do: "run_turn_end_tasks"; then: AfterTurn }
  /** 作業の終わりにすることの予約を消す（notice: 移さなかったお知らせを残す） */
  | { do: "drop_turn_end_tasks"; notice: boolean };

/** step の答え */
export interface Step {
  state: ChatRunState;
  effects: Effect[];
}

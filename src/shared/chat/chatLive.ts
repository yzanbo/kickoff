// 作業中のチャットの様子（保存しない。チャットの詳細の live と SSE の chat_live で同じ形で配る）。型と定数のみ
import type { ApiRetryInfo, BackgroundState } from "@shared/ai/turnEvents";
import type { ChatStatus, QueueAction, QueuedMessage } from "./types";
import type { CompactTrigger } from "@shared/ai/turnEvents";
import type { ProviderId } from "@shared/settings/types";

/** 作業の段階（idle のほかは作業中。preparing = 送る準備・親の会話を写す・AI の切り替え・作業場所の移動、settling = 作業の終わりにすることを待つ） */
export const WORK_PHASES = ["idle", "preparing", "running", "awaiting_compact", "compacting", "compacted", "settling"] as const;
export type WorkPhase = (typeof WORK_PHASES)[number];

/** 作業中か（段階が idle でない） */
export function isBusyPhase(phase: WorkPhase): boolean {
  return phase !== "idle";
}

/** 送る準備の理由（段階が preparing のとき） */
const PREPARE_REASONS = ["send", "inherit", "switch_provider", "handoff_retry", "move_workplace"] as const;
export type PrepareReason = (typeof PREPARE_REASONS)[number];

/** 「いま」を預かる理由: 親の会話を写している / 圧縮の前と最中 / 圧縮したやり取りの途中 / 入力が閉じた / 預かった指示を書き直している */
const HOLD_REASONS = ["inherit", "compact", "exchange", "closed", "editing"] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

/** AI の切り替えの引き継ぎの状態（送ってよい / 準備できていない / 送っている途中 / 受け取ったか分からない） */
const HANDOFF_STATES = ["ready", "blocked", "sending", "uncertain"] as const;
export type HandoffState = (typeof HANDOFF_STATES)[number];
/** AI の切り替えの引き継ぎの様子（コアの門と同じ: 準備ができていても、チャットの AI が切り替え先でなければ blocked） */
export type ProviderHandoff = { state: HandoffState; provider: ProviderId };

/** 作業の終わりの予約の種類（いまは AI が予約した作業場所の移動だけ） */
const TURN_END_KINDS = ["workplace_move"] as const;

/** 送信待ちの頭が待っている理由（作業中 / 止めている・線で待つ / Kickoff が止めた / AI の引き継ぎ / 書き直し / 起動したときの確かめ） */
const QUEUE_WAIT_REASONS = ["busy", "paused", "recovery", "handoff", "editing", "hold"] as const;

/** 通信が切れて止まったチャットの、つながったら自動で再開するのを待っている状態（保存しない） */
export interface ReconnectState {
  /** これまでに自動で再開した回数 */
  attempts: number;
  /** 自動で再開する回数の上限（超えたら人に聞く） */
  max: number;
  /** 通信の切断で止まり、つながったら続きから再開を頼むサブエージェントの名前（なければ空） */
  agents: string[];
}

/** 作業中に送った次の指示の待ちの列（送信待ち）の様子。送信待ちを変える API の応答も同じ形 */
export interface QueueState {
  messages: QueuedMessage[];
  /** いまの作業が終わっても、自動で送らずに止めておくか */
  paused: boolean;
  /** 一時停止の印の位置（0 = 1 件目の上、n = n 件目のあと。小さい順） */
  stops: number[];
  /** 次の指示を画面で書き直しているので、送らずに書き直しが終わるのを待っている（作業は終わり、送信の準備ができている） */
  waiting_edit: boolean;
  /** 出す箱の now の列（ChatLive.now と同じ） */
  now: QueuedMessage[];
  /** 列の頭が待っている理由（列が空・待っていなければ null） */
  waiting: (typeof QUEUE_WAIT_REASONS)[number] | null;
  /** 作業の終わりにすぐ行う圧縮・消去（列の頭の予約。なければ null） */
  reserved: QueueAction | null;
  /** 送信待ちから取り出して送っている途中の指示（発言を記録するまで。画面は送信待ちの下に「送信中…」で出す） */
  sending: QueuedMessage[];
}

/** 会話を圧縮（要約）している最中の様子 */
export interface CompactingState {
  /** 圧縮を始めた時刻（終わるまで変えない） */
  since: string;
  /** 手で圧縮したか、上限に近づいて自動でか（自動のときは、なぜ作業が止まって見えるかを画面で添える） */
  trigger: CompactTrigger;
}

/** 作業中のチャットの様子の全体（どれかが変わるたびに、SSE の chat_live で丸ごと配る） */
export interface ChatLive {
  queue: QueueState;
  /** 裏で動いている作業と、メインの返答が終わったか（作業中でなければ null） */
  background: BackgroundState | null;
  /** AI の API への通信を再試行しているところ（していなければ null） */
  retry: ApiRetryInfo | null;
  /** 通信が切れて止まり、つながったら自動で再開するのを待っているところ（待っていなければ null） */
  reconnect: ReconnectState | null;
  /** 会話を圧縮している最中の様子（していなければ null。手で圧縮したときも、上限に近づいて自動で圧縮されたときも） */
  compacting: CompactingState | null;
  /** 停止を頼んで、作業が終わるのを待っているか（サブエージェント・裏のコマンドごと終わるまで数秒かかる） */
  stopping: boolean;
  /** AI が返答の図（kickoff_chat の show_visual・update_visual）の中身を書いている途中か（書き終えると図の行が出る。画面は「図を描いています…」） */
  drawing_visual: boolean;
  /**
   * 起動したときの再開の確かめを待っている（前回の終了で、作業の途中で止まった・自動で送るまま送信待ちが残った。答えるまで続けない・送らない。なければ null）。
   * interrupted: 前回の終了で、作業の途中で止まったか（「続ける」を選べる）。queued: 起動すると送り始める送信待ちがあるか（「送る」を選べる）
   */
  restart_resume: RestartResumeState | null;
  /**
   * AI が予約した作業場所の移動（kickoff_chat の move_workplace。この作業が最後まで終わったら Kickoff が移し、続きを送る。なければ null）。
   * 画面とスマホに「作業が終わったら … へ移ります」と出し、取り消せる（DELETE /api/chats/:id/workplace-move）
   */
  workplace_move: WorkplaceMoveReservation | null;
  /** 作業の段階（作業中 = isBusyPhase） */
  phase: WorkPhase;
  /** chats.status の写し（status が変わったら、chat の知らせのすぐあとに chat_live でも届ける） */
  status: ChatStatus;
  /** AI の切り替えの引き継ぎの様子（引き継ぎがなければ null） */
  provider_handoff: ProviderHandoff | null;
  /** 送る準備の理由（phase が preparing のとき） */
  preparing_for: PrepareReason | null;
  /** 圧縮前指示を送ってから圧縮が終わるまでの、圧縮のきっかけ（phase が awaiting_compact のとき。manual = 手で頼んだ圧縮） */
  compact_by: CompactTrigger | null;
  /** 「いま」を預かっている理由（預かっていなければ null） */
  hold: HoldReason | null;
  /**
   * 出す箱の now の列（送った順）: 圧縮後指示と、圧縮前指示から圧縮のあとのやり取りが終わるまで・入力が閉じたあとに「いま」で送った指示（預かり）・移動の続き。
   * 自分の指示はいまのやり取りに足さず、そのやり取りが終わってから送る（送信待ちより先。作業ごと送れない終わり方をしたら、送信待ちの先頭に入れる）
   */
  now: QueuedMessage[];
  /** 作業の終わりの予約（いまは AI が予約した作業場所の移動だけ） */
  turn_end: { kind: (typeof TURN_END_KINDS)[number]; label: string }[];
  /** 作業の中の圧縮の様子（段階と重なるもの。圧縮中は compacting） */
  compaction: LiveCompaction;
  /** いまの作業の入力が閉じた（Claude Code が手を空けて入力を閉じたあと、作業が終わるまで。この間の「いま」は預かり、作業の終わりに送信待ちより先に送る） */
  input_closed: boolean;
}

/**
 * 作業の中の圧縮の様子。同じ作業の中で重なり、段階（phase）からは読めない:
 * awaiting = 圧縮前指示を送ってから圧縮が終わるまで（圧縮中も立つ）/ after_turn = 作業中に手で頼んだ圧縮の圧縮前指示を伝えた（この作業が最後まで終わったら圧縮する。画面は「いまの作業が終わったら圧縮します」）/
 * done = 圧縮したやり取りの途中（手で圧縮する実行の終わりまで段階が awaiting_compact のままでも立つ。この間の「いま」も預かる）
 */
export interface LiveCompaction {
  awaiting: boolean;
  after_turn: boolean;
  done: boolean;
}

/** 送信待ちが空で、待っていない様子 */
export const EMPTY_QUEUE_STATE: QueueState = { messages: [], paused: false, stops: [], waiting_edit: false, now: [], waiting: null, reserved: null, sending: [] };

/** 何も起きていない作業中の様子（画面の既定・テストの元。status はまだ知らない間の completed） */
export const EMPTY_CHAT_LIVE: ChatLive = {
  queue: EMPTY_QUEUE_STATE,
  background: null,
  retry: null,
  reconnect: null,
  compacting: null,
  stopping: false,
  drawing_visual: false,
  restart_resume: null,
  workplace_move: null,
  phase: "idle",
  status: "completed",
  provider_handoff: null,
  preparing_for: null,
  compact_by: null,
  hold: null,
  now: [],
  turn_end: [],
  compaction: { awaiting: false, after_turn: false, done: false },
  input_closed: false,
};

/** AI が予約した作業場所の移動の様子（ChatLive の workplace_move） */
export interface WorkplaceMoveReservation {
  /** 移す先の呼び名（「本体」「ワークツリー（feat/x）」「新しいワークツリー（feat/x）」） */
  label: string;
  /** コミットしていない変更も持っていく（利用者が承認したもの） */
  carry: boolean;
  /** 移したあとに続きの指示を送るか */
  continuation: boolean;
}

/** 起動したときの再開の確かめを待っているチャットの様子（ChatLive の restart_resume） */
export interface RestartResumeState {
  interrupted: boolean;
  queued: boolean;
}

/**
 * 起動したときの再開の確かめの答え: 送る（送信待ちだけを送る）/ 続ける（中断した作業を続け、送信待ちはその作業が終わってから送る）/
 * 止めておく（送信待ちは止めています、作業は止めたまま）。送信待ちのないチャットに「送る」は選べない。画面の文言は restartResumeActionLabel
 */
export const RESTART_RESUME_ACTIONS = ["send", "continue", "pause"] as const;
export type RestartResumeAction = (typeof RESTART_RESUME_ACTIONS)[number];

/** 答えの文言（送信待ちがあるかで変える。送信待ちのないチャットの「止めておく」は「止めたまま」） */
export function restartResumeActionLabel(action: RestartResumeAction, queued: boolean): string {
  if (action === "send") return "送る";
  if (action === "continue") return queued ? "続けてから送る" : "続ける";
  return queued ? "止めておく" : "止めたまま";
}

/** 起動したときの再開の確かめの、止まったところの 1 つ（文と、その時刻） */
export interface RestartResumeMoment {
  text: string;
  at: string;
}

/**
 * 起動したときの再開の確かめ: 前回の終了で、作業の途中で止まった・自動で送るまま送信待ちが残ったチャット（答えるまで続けない・送らない）。
 * 選ぶ前に中身を見られるよう、送信待ちのすべてと、止まったところ（最後の指示・AI の最後の返答・最後のツール）・止まったサブエージェントを添える
 */
export interface RestartResume {
  chat_id: number;
  project_id: number;
  /** チャットの名前（なければ null） */
  title: string | null;
  /** 前回の終了で、作業の途中で止まったか（「続ける」を選べる） */
  interrupted: boolean;
  /** 起動すると送り始める送信待ちがあるか（「送る」を選べる。なければ messages は空） */
  queued: boolean;
  /** 送信待ち（並び・一時停止の印は送信待ちの見た目と同じ） */
  messages: QueuedMessage[];
  stops: number[];
  /** 止まったところ: 最後の自分の指示・メインエージェントの最後の返答（長ければ頭だけ）・最後に動かしたツール（なければ null） */
  last_prompt: RestartResumeMoment | null;
  last_reply: RestartResumeMoment | null;
  last_tool: RestartResumeMoment | null;
  /** 最後の記録の時刻（止まった時刻の目安。記録がなければ null） */
  stopped_at: string | null;
  /** 作業の途中で止まったサブエージェント（最後の自分の指示より後に始めて、終わっていないもの。「続ける」で再開を頼む） */
  subagents: RestartResumeSubagent[];
}

/** 起動したときの再開の確かめの、止まったサブエージェント（説明と、Claude Code の ID。ID が分からなければ null） */
export interface RestartResumeSubagent {
  description: string;
  agent_id: string | null;
}

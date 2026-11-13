// 作業中のチャットの様子（保存しない。チャットの詳細の live と SSE の chat_live で同じ形で配る）。型と定数のみ
import type { QueuedMessage } from "./chat";
import type { CompactTrigger } from "./chatEvent";

/** AI の API への通信を Claude Code が再試行しているところ（通信が切れたときなど。保存しない） */
export interface ApiRetryInfo {
  attempt: number;
  max_retries: number;
  retry_delay_ms: number;
  /** 知らせを受けた時刻（次に送り直すまでの残りを数える） */
  at: string;
}

/** 裏で動いている作業の 1 件（サブエージェント・裏で動かしたコマンドなど。Claude Code の background_tasks_changed） */
export interface BackgroundTask {
  /** 作業 ID（サブエージェントなら、その ID。SendMessage の宛先にも使う） */
  task_id: string;
  kind: "agent" | "command" | "other";
  description: string;
  subagent_type?: string;
  /** 作業を起動した呼び出しの ID（Bash・Agent など。開始の知らせが届いていなければない） */
  tool_use_id?: string;
}

/**
 * 裏で動いている作業の様子（保存しない）。tasks はいま動いているものすべて（知らせのたびに丸ごと置き換える）。
 * replied: メインの返答は書き終わっていて、裏の作業の終わりを待っているだけか
 */
export interface BackgroundState {
  tasks: BackgroundTask[];
  replied: boolean;
}

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
  /**
   * 圧縮後指示（post_compact。圧縮が終わったら、いまのやり取りに最初に伝える）と、圧縮前指示から圧縮後指示のやり取りが終わるまで
   * （どちらもなければ、圧縮からそのあとのやり取りが終わるまで）に「いま」で送った指示（送った順）。自分の指示はいまのやり取りに足さず、
   * そのやり取りが終わってから送る（送信待ちより先。作業ごと送れない終わり方をしたら、送信待ちの先頭に入れる）。
   * 圧縮の前後に足すと、圧縮前指示の作業・圧縮後指示のやり取りに混ざり、要約したあとの会話に入ったかも分からないため
   */
  after_compact: QueuedMessage[];
  /**
   * 作業中に手で頼んだ圧縮の圧縮前指示を、いまの作業に伝えた（その作業が最後まで終わったら圧縮する）。送信待ちに圧縮の行を置かないので、
   * 画面はこれで「いまの作業が終わったら圧縮します」を出す（もう一度頼めるように見せない）
   */
  compact_after_turn: boolean;
  /**
   * 圧縮前指示を送ってから、会話の圧縮が終わるまで（圧縮前指示の作業中も含む）。この間の「いま」は after_compact に預かり、
   * 圧縮が終わってから伝える（圧縮前指示の作業に混ざる・圧縮より前の会話に入るのを防ぐため）
   */
  awaiting_compact: boolean;
  /**
   * 会話を圧縮したやり取りの途中（自動の圧縮があった作業・手で圧縮したあとの圧縮後指示の作業。終わるまで）。この間の「いま」も after_compact に預かり、
   * このやり取りが終わってから送る
   */
  compacted_turn: boolean;
  /**
   * いまの作業に「いま」を足せなくなった（Claude Code が手を空けて入力を閉じたあと、作業が終わるまで）。この間の「いま」は after_compact に預かり、
   * 作業の終わりに送信待ちより先に送る（画面は預かった指示に「この作業が終わったら送ります」と添える）
   */
  tells_closed: boolean;
  /** 子チャットで親の会話を写している（動かし始める前。親の記録が大きいと数十秒かかる。作業中の行に「親の会話を引き継いでいます」） */
  inheriting: boolean;
  /**
   * 起動したときの送信待ちの確かめを待っている（前回の終了で、自動で送るまま送信待ちが残った。答えるまで送らない。なければ null）。
   * interrupted: 前回の終了で、作業の途中で止まったか（「続けてから送る」を選べる）
   */
  queue_resume: { interrupted: boolean } | null;
}

/**
 * 起動したときの送信待ちの確かめの答え（自動で送るまま残った送信待ちを、起動してからどうするか）: 送る / 中断した作業を続けてから送る / 止めておく。
 * 画面の文言は QUEUE_RESUME_ACTION_LABELS
 */
export const QUEUE_RESUME_ACTIONS = ["send", "continue", "pause"] as const;
export type QueueResumeAction = (typeof QUEUE_RESUME_ACTIONS)[number];
export const QUEUE_RESUME_ACTION_LABELS: Record<QueueResumeAction, string> = {
  send: "送る",
  continue: "続けてから送る",
  pause: "止めておく",
};

/** 起動したときの送信待ちの確かめの、止まったところの 1 つ（文と、その時刻） */
export interface QueueResumeMoment {
  text: string;
  at: string;
}

/**
 * 起動したときの送信待ちの確かめ: 前回の終了で、自動で送るまま送信待ちが残ったチャット（答えるまで送らない）。
 * 選ぶ前に中身を見られるよう、送信待ちのすべてと、止まったところ（最後の指示・AI の最後の返答・最後のツール）を添える
 */
export interface QueueResume {
  chat_id: number;
  project_id: number;
  /** チャットの名前（なければ null） */
  title: string | null;
  /** 前回の終了で、作業の途中で止まったか（「続けてから送る」を選べる） */
  interrupted: boolean;
  /** 送信待ち（並び・一時停止の印は送信待ちの見た目と同じ） */
  messages: QueuedMessage[];
  stops: number[];
  /** 止まったところ: 最後の自分の指示・メインエージェントの最後の返答（長ければ頭だけ）・最後に動かしたツール（なければ null） */
  last_prompt: QueueResumeMoment | null;
  last_reply: QueueResumeMoment | null;
  last_tool: QueueResumeMoment | null;
  /** 最後の記録の時刻（止まった時刻の目安。記録がなければ null） */
  stopped_at: string | null;
}

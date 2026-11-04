// 作業中のチャットの様子（保存しない。チャットの詳細の live と SSE の chat_live で同じ形で配る）。型と定数のみ
import type { QueuedMessage } from "./chat";

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

/** 作業中のチャットの様子の全体（どれかが変わるたびに、SSE の chat_live で丸ごと配る） */
export interface ChatLive {
  queue: QueueState;
  /** 裏で動いている作業と、メインの返答が終わったか（作業中でなければ null） */
  background: BackgroundState | null;
  /** AI の API への通信を再試行しているところ（していなければ null） */
  retry: ApiRetryInfo | null;
  /** 通信が切れて止まり、つながったら自動で再開するのを待っているところ（待っていなければ null） */
  reconnect: ReconnectState | null;
  /** 会話を圧縮している最中なら、始めた時刻（していなければ null。手で圧縮したときも、上限に近づいて自動で圧縮されたときも） */
  compacting: string | null;
  /** 停止を頼んで、作業が終わるのを待っているか（サブエージェント・裏のコマンドごと終わるまで数秒かかる） */
  stopping: boolean;
}

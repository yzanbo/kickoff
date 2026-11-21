// AI の実行が出す記録（AgentEvent）と、知らせる途中の様子（サブエージェント・コマンドの出力・通信の再試行・裏の作業）。型のみ

/**
 * AI の実行が出す記録（プロバイダーが出す 8 種類。チャットの記録 chat_events にこの形のまま残る。
 * 利用者の発言・承認・作業の終わりなどほかの記録はコアが作る = @shared/chat/chatEvent の ChatEventData はこれとの合併）
 */
export type AgentEvent =
  /** effort: 実際に使った推論の深さ（Claude Code が知らせたときだけ。null は深さを送らないモデル） */
  | { type: "init"; session_id: string; model?: string; permission_mode?: string; effort?: string | null }
  /** parent: サブエージェントの発言なら、そのサブエージェントを起動した Task / Agent ツールの呼び出し ID（メインの発言にはない） */
  | { type: "text"; text: string; parent?: string }
  /** 思考（text は既定では空）。duration_ms: 考えていた時間（メインエージェントで、測れたときだけ） */
  | { type: "thinking"; text: string; duration_ms?: number; parent?: string }
  | { type: "tool_use"; id: string; name: string; input: unknown; parent?: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean; parent?: string }
  | { type: "notice"; message: string }
  /**
   * 会話を要約してコンテキストを空けた（manual: 手で圧縮 / auto: 上限に近づいて自動で）。前後のトークン数。
   * duration_ms: 圧縮にかかった時間（Claude Code が知らせたときだけ。記録の時刻 = 終わった時刻から引くと始めた時刻）
   */
  | { type: "compact"; trigger: CompactTrigger; pre_tokens: number; post_tokens?: number; duration_ms?: number }
  /** サブエージェントの開始・終了（途中経過は保存せず、chat_subagent で届く） */
  | ({ type: "subagent" } & SubagentInfo);

/** 会話の圧縮のきっかけ（manual: 手で圧縮した（圧縮のボタン・/compact）/ auto: コンテキストが上限に近づいて Claude Code が自動で） */
export type CompactTrigger = "manual" | "auto";

/** サブエージェント（Task / Agent ツールで起動された別のエージェント）の状態 */
export interface SubagentInfo {
  task_id: string;
  /** 起動した Task / Agent ツールの呼び出し ID（タイムラインの呼び出しと結びつける） */
  tool_use_id?: string;
  description: string;
  subagent_type?: string;
  status: "running" | "completed" | "failed" | "stopped";
  tokens?: number;
  tool_uses?: number;
  duration_ms?: number;
  /** 直近に使ったツール（途中経過） */
  last_tool?: string;
  summary?: string;
}

/**
 * 実行中のコマンド（Bash。手前で待つものも裏で動かしたものも）の出力の終わりの部分（保存しない。chat_command_output で届く）。
 * 色の制御文字は除き、\r で上書きした行は最後の状態だけにしてある。終わったら届かなくなり、結果はツールの結果の記録で届く
 */
export interface CommandOutput {
  /** コマンドを実行した Bash の呼び出し ID（流れのツールの呼び出しと結びつける） */
  tool_use_id: string;
  /** Claude Code の作業 ID（裏で動いている作業の一覧と結びつける） */
  task_id: string;
  /** 出力の最後の行（プロバイダーが最後の 40 行に切る。providers/shared/events.ts） */
  text: string;
}

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

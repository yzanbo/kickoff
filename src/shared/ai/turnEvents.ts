// AI の実行が知らせる途中の様子（サブエージェント・コマンドの出力・通信の再試行・裏の作業）。型のみ
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

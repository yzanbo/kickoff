// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { Approval } from "./approval";
import type { AppSettings } from "./settings";
import type { Project } from "./project";
import type { PlanUsage } from "./provider";
import type { Chat, ChatGroup } from "./chat";
import type { ChatEvent, CommandOutput, SubagentInfo } from "./chatEvent";
import type { ChatLive } from "./chatLive";
import type { VoiceDownload } from "./voice";

/** サーバーからクライアントへ配信するイベント（SSE） */
export type BusEvent =
  | { type: "project"; project: Project }
  | { type: "project_deleted"; id: number }
  | { type: "chat"; chat: Chat }
  | { type: "chat_deleted"; id: number; project_id: number }
  | { type: "group"; group: ChatGroup }
  | { type: "group_deleted"; id: number; project_id: number }
  | { type: "chat_event"; project_id: number; event: ChatEvent }
  /** 会話の記録の from_event_id から後ろ（それを含む）を消した（巻き戻し。画面の記録からも消す） */
  | { type: "chat_events_deleted"; project_id: number; chat_id: number; from_event_id: number }
  /** AI の返答の途中経過（保存しない。確定した文は chat_event の text で届く） */
  | { type: "chat_delta"; project_id: number; chat_id: number; text: string }
  /** サブエージェントの途中経過（トークン数・直近のツール。保存しない） */
  | { type: "chat_subagent"; project_id: number; chat_id: number; subagent: SubagentInfo }
  /** 実行中のコマンドの出力の終わりの部分（増えるたびに丸ごと。保存しない。結果はツールの結果の記録で届く） */
  | { type: "chat_command_output"; project_id: number; chat_id: number; output: CommandOutput }
  /** 作業中の様子（送信待ち・裏の作業・再試行・再接続待ち・圧縮中・停止中）。どれかが変わるたびに全体を送る（チャットの詳細の live と同じ形） */
  | { type: "chat_live"; project_id: number; chat_id: number; live: ChatLive }
  | { type: "approval"; approval: Approval }
  | { type: "approval_resolved"; id: string; chat_id: number }
  | { type: "settings"; settings: AppSettings }
  | { type: "usage"; usage: PlanUsage }
  /** 音声入力のモデルのダウンロードの進み具合（download が null なら終わった・やめた。downloaded はファイルがあるか） */
  | { type: "voice_model"; id: string; download: VoiceDownload | null; downloaded: boolean }
  /** プロジェクトのメモを作った・書いた・動かした・ゴミ箱へ移した（Kickoff の中の操作だけ。一覧と開いているメモを取り直す） */
  | { type: "memos"; project_id: number; path: string | null };

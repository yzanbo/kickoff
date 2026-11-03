// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { Approval } from "./approval.js";
import type { AppSettings } from "./settings.js";
import type { Project } from "./project.js";
import type { PlanUsage } from "./provider.js";
import type { QueuedMessage, Run, RunEvent, RunGroup, SubagentInfo } from "./run.js";
import type { VoiceDownload } from "./voice.js";

/** サーバーからクライアントへ配信するイベント（SSE） */
export type BusEvent =
  | { type: "project"; project: Project }
  | { type: "project_deleted"; id: number }
  | { type: "run"; run: Run }
  | { type: "run_deleted"; id: number; project_id: number }
  | { type: "group"; group: RunGroup }
  | { type: "group_deleted"; id: number; project_id: number }
  | { type: "run_event"; project_id: number; event: RunEvent }
  /** 会話の記録の from_event_id から後ろ（それを含む）を消した（巻き戻し。画面の記録からも消す） */
  | { type: "run_events_deleted"; project_id: number; run_id: number; from_event_id: number }
  /** AI の返答の途中経過（保存しない。確定した文は run_event の text で届く） */
  | { type: "run_delta"; project_id: number; run_id: number; text: string }
  /** サブエージェントの途中経過（トークン数・直近のツール。保存しない） */
  | { type: "run_subagent"; project_id: number; run_id: number; subagent: SubagentInfo }
  /** 作業中のチャットに送った次の指示の待ちの列（変わるたびに全体を送る） */
  | { type: "run_queue"; project_id: number; run_id: number; queue: QueuedMessage[]; /** 終わっても自動で送らずに止めておくか */ paused: boolean }
  | { type: "approval"; approval: Approval }
  | { type: "approval_resolved"; id: string; run_id: number }
  | { type: "settings"; settings: AppSettings }
  | { type: "usage"; usage: PlanUsage }
  /** 音声入力のモデルのダウンロードの進み具合（download が null なら終わった・やめた。downloaded はファイルがあるか） */
  | { type: "voice_model"; id: string; download: VoiceDownload | null; downloaded: boolean };

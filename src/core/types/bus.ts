// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { Approval } from "./approval.js";
import type { AppSettings } from "./settings.js";
import type { Project } from "./project.js";
import type { PlanUsage } from "./provider.js";
import type { Run, RunEvent, RunGroup, SubagentInfo } from "./run.js";

/** サーバーからクライアントへ配信するイベント（SSE） */
export type BusEvent =
  | { type: "project"; project: Project }
  | { type: "project_deleted"; id: number }
  | { type: "run"; run: Run }
  | { type: "run_deleted"; id: number; project_id: number }
  | { type: "group"; group: RunGroup }
  | { type: "group_deleted"; id: number; project_id: number }
  | { type: "run_event"; project_id: number; event: RunEvent }
  /** AI の返答の途中経過（保存しない。確定した文は run_event の text で届く） */
  | { type: "run_delta"; project_id: number; run_id: number; text: string }
  /** サブエージェントの途中経過（トークン数・直近のツール。保存しない） */
  | { type: "run_subagent"; project_id: number; run_id: number; subagent: SubagentInfo }
  | { type: "approval"; approval: Approval }
  | { type: "approval_resolved"; id: string; run_id: number }
  | { type: "settings"; settings: AppSettings }
  | { type: "usage"; usage: PlanUsage };

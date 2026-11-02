// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { ArtifactKind, Phase, TaskStatus } from "./phases.js";

export interface Task {
  id: number;
  project_id: number;
  phase: Phase;
  title: string;
  description: string;
  acceptance_criteria: string;
  status: TaskStatus;
  priority: number; // 1: 高 / 2: 中 / 3: 低
  summary: string;
  /** 作業ブランチ（worktree を作ったときに設定） */
  branch: string;
  worktree_path: string;
  pr_url: string;
  created_by: "user" | "agent";
  created_at: string;
  updated_at: string;
}
export interface Artifact {
  id: number;
  project_id: number;
  phase: Phase;
  kind: ArtifactKind;
  title: string;
  content: string;
  file_path: string;
  run_id: number | null;
  task_id: number | null;
  created_at: string;
}

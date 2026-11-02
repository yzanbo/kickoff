// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { ArtifactKind, EffortLevel, PermissionChoice, Phase, ProviderId, TaskStatus } from "./phases.js";
import type { RunStatus } from "./run.js";

// Store に渡す作成時の入力（DB の行の形ではなく、省略できる項目は既定で埋める）

export interface NewProject {
  name: string;
  description?: string;
  repo_path: string;
  provider: ProviderId;
  test_command?: string;
  deploy_instructions?: string;
  auto_commit?: boolean;
}

export interface NewTask {
  project_id: number;
  phase: Phase;
  title: string;
  description?: string;
  acceptance_criteria?: string;
  priority?: number;
  status?: TaskStatus;
  created_by?: "user" | "agent";
}

export interface NewRun {
  project_id: number;
  task_id: number | null;
  phase: Phase;
  provider: ProviderId;
  title: string;
  status: RunStatus;
  model: string | null;
  effort?: EffortLevel | null;
  permission_mode?: PermissionChoice;
  fast_mode?: boolean;
  group_id?: number | null;
  /** 作業場所（ワークツリーのフォルダ。省略・空なら本体） */
  worktree_path?: string;
}

export interface NewArtifact {
  project_id: number;
  phase: Phase;
  kind: ArtifactKind;
  title: string;
  content: string;
  file_path?: string;
  run_id?: number | null;
  task_id?: number | null;
}

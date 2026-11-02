// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { EffortLevel, PermissionChoice, ProviderId } from "./settings.js";
import type { RunStatus } from "./run.js";

// Store に渡す作成時の入力（DB の行の形ではなく、省略できる項目は既定で埋める）

export interface NewProject {
  name: string;
  description?: string;
  repo_path: string;
  provider: ProviderId;
}

export interface NewRun {
  project_id: number;
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


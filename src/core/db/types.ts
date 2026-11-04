// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { EffortLevel, PermissionMode, ProviderId } from "@shared/types/settings";
import type { ChatStatus } from "@shared/types/chat";

// Store に渡す作成時の入力（DB の行の形ではなく、省略できる項目は既定で埋める）

export interface NewProject {
  name: string;
  description?: string;
  repo_path: string;
  provider: ProviderId;
}

export interface NewChat {
  project_id: number;
  provider: ProviderId;
  title: string;
  status: ChatStatus;
  model: string | null;
  effort?: EffortLevel | null;
  permission_mode?: PermissionMode;
  fast_mode?: boolean;
  group_id?: number | null;
  /** 作業場所（ワークツリーのフォルダ。省略・空なら本体） */
  worktree_path?: string;
}


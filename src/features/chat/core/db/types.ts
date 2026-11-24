// チャットの店の型: 作成時の入力（DB の行の形ではなく、省略できる項目は既定で埋める）・一覧の絞り込み・変えられる列。コアの中だけで使う
import type { Chat, ChatOptionsPatch, ChatStatus, GitHubKind } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";

/** 選択（モデル・深さ・権限・ファスト）は省けば、指定しない・毎回確認・使わない */
export interface NewChat extends ChatOptionsPatch {
  project_id: number;
  provider: ProviderId;
  title: string;
  status: ChatStatus;
  group_id?: number | null;
  /** 作業場所（ワークツリーのフォルダ。省略・null なら本体） */
  worktree_path?: string | null;
  /** 子チャットの親と、親の会話のどの記録から聞いたか */
  parent_chat_id?: number | null;
  parent_event_id?: number | null;
  /** ノートのチャットのノート（ノートのフォルダからの相対パス） */
  note_path?: string | null;
  /** Git で管理していないファイルだけを書けるチャットか（省けば false） */
  untracked_only?: boolean;
  /** 新しいチャットの制限（省くとアプリの既定） */
  sandbox_enabled?: boolean;
  edit_scope_enabled?: boolean;
  /** 結び付いた GitHub の issue・PR */
  github_repo?: string | null;
  github_number?: number | null;
  github_kind?: GitHubKind | null;
  /** AI が作った世代（AI の create_chat が作ったチャットだけ。省けば 0 = 利用者が作った） */
  ai_generation?: number;
}

/** チャットの一覧の絞り込み（並びは最後に動いた順） */
export interface ChatFilter {
  projectId?: number;
  statuses?: ChatStatus[];
  limit?: number;
  includeArchived?: boolean;
  onlyArchived?: boolean;
}

/** update で変えられる列（型と UPDATE の対象をここ 1 つで決める。固定・グループ・プロジェクト・アーカイブは専用の操作で変える） */
export const CHAT_COLUMNS = [
  "title",
  "status",
  "error",
  "session_id",
  "turn_started_at",
  "model",
  "effort",
  "permission_mode",
  "fast_mode",
  "cost_usd",
  "num_turns",
  "context_tokens",
  "context_window",
  "branch",
  "finished_worktree_branch",
  "unread",
] as const satisfies readonly (keyof Chat)[];

/** チャットの変えられる項目 */
export type ChatPatch = Partial<Pick<Chat, (typeof CHAT_COLUMNS)[number]>>;

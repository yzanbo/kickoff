// 店に渡す作成時の入力（DB の行の形ではなく、省略できる項目は既定で埋める。コアの中だけで使う）
import type { ChatOptionsPatch, ChatStatus, GitHubKind, ProviderId } from "@shared/types";

export interface NewProject {
  name: string;
  description?: string;
  repo_path: string;
  provider: ProviderId;
}

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
  /** メモのチャットのメモ（メモのフォルダからの相対パス） */
  memo_path?: string | null;
  /** Git で管理していないファイルだけを書けるチャットか（省けば false） */
  untracked_only?: boolean;
  /** 結び付いた GitHub の issue・PR */
  github_repo?: string | null;
  github_number?: number | null;
  github_kind?: GitHubKind | null;
  /** AI が作った世代（AI の create_chat が作ったチャットだけ。省けば 0 = 利用者が作った） */
  ai_generation?: number;
}

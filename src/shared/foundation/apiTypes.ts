// HTTP API の本文と応答の形（コアのルートと画面で同じものを使う）。型のみ
// 資源そのもの（Project・Chat・ChatGroup など）は各ファイルにあり、ここには API にだけ出てくる形を置く（取り決めに乗せた機能の形は src/shared/<機能>/ へ移した）
import type { AttachmentSource } from "@shared/chat/types";
import type { GitHubCheckoutPlace, GitHubCloseReason, GitHubMergeMethod, GitHubReviewDraftComment, GitHubReviewEvent } from "@shared/github/types";
import type { Project, ProjectReference } from "@shared/projects/types";
import type { ProviderId } from "@shared/settings/types";

// ---- 本文（画面が送る形。コアは zod の形をこの型に合わせる） ----

/** 新しいプロジェクト（POST /api/projects）。description は README の「アイデア」にも書く（空・null はなし）。provider を省けば設定の既定 */
export type NewProjectBody = {
  name: string;
  description?: string | null;
  parent_dir: string;
  folder_name: string;
  provider?: ProviderId;
  /** git リポジトリとして初期化するか（省くと初期化する） */
  init_git?: boolean;
} & NewProjectNoteDir;

/**
 * 新しいプロジェクト・取り込むプロジェクトのノートのフォルダ（省けば初めてノートを使ったときにプロジェクト名から決める）。
 * note_folder: 設定のノートの親フォルダの下のフォルダ名（ほかのプロジェクトと重なれば「名前-2」）/ note_dir: このプロジェクトだけ別の場所（絶対パス。note_folder より優先）
 */
export interface NewProjectNoteDir {
  note_folder?: string;
  note_dir?: string;
}

/** 既存のフォルダを取り込む（POST /api/projects/import）。init_git なら Git のリポジトリにしてから取り込む */
export type ImportProjectBody = {
  path: string;
  name: string;
  description?: string | null;
  init_git?: boolean;
  provider?: ProviderId;
} & NewProjectNoteDir;

/**
 * プロジェクトの変更（PATCH /api/projects/:id。書いた項目だけ変える）。tags・reference_paths は送った内容で置き換える。
 * 参照資料はパスだけ送れば、フォルダかファイルかはサーバーで調べる。archived はしまう（アーカイブ）・戻す
 */
export type ProjectPatch = Partial<Pick<Project, "name" | "description" | "provider" | "hue" | "tags" | "pinned" | "note_dir" | "pre_compact_prompt" | "post_compact_prompt" | "pre_compact_enabled" | "post_compact_enabled" | "github_account" | "github_remote" | "pr_watch" | "ci_watch">> & {
  archived?: boolean;
  reference_paths?: Pick<ProjectReference, "path">[];
};

/** AI のブラウザでのログインを始めた答え（POST /api/providers/:id/login。画面は auth_url を既定のブラウザで開き、provider_login の知らせを待つ） */
export interface ProviderLoginStart {
  auth_url: string;
}

/**
 * プロジェクトのフォルダ（本体）を変える（PUT /api/projects/:id/repo-path）。取り込みと同じ決まりで、git のルートのフォルダを指す。
 * git でない・コミットがないフォルダは init_git で初期化に同意したときだけ
 */
export interface ProjectRepoPathBody {
  path: string;
  init_git?: boolean;
}

/**
 * 「AI に渡す」で取る中身（POST /api/captures）。コアが鍵らしい値を伏せ、添付の上限を超えれば頭と終わりを残して切ってから保存し、CaptureAttachment を返す。
 * tail_share は残す分のうち終わりに回す割合（ログは多め。省けば半分）。
 * 中身は文 text か、画像 image_base64（ブラウザの画面など。mime は画像の形式。伏せず・切らず、添付の上限を超えれば 400）のどちらか 1 つ
 */
export interface CaptureBody {
  name: string;
  mime?: string;
  text?: string;
  image_base64?: string;
  source: AttachmentSource;
  tail_share?: number;
}

/** PR のブランチのワークツリー（POST /api/projects/:id/github/pulls/:number/worktree の応答。いまあればそれ、なければ作ったもの） */
export interface GitHubPullWorktree {
  /** 作業場所（本体で取り出しているなら null） */
  worktree_path: string | null;
  /** 手元のブランチ（元のブランチを remote に持っていればその名前、ほかの人の fork なら pr-N） */
  branch: string;
}

/** GitHub の issue・PR へのコメント（POST /api/projects/:id/github/items/:number/comments。Markdown） */
export interface GitHubCommentBody {
  body: string;
}

/** issue・PR を閉じる / 開き直す（POST …/github/issues|pulls/:number/state。reason は issue を閉じるときだけ） */
export interface GitHubStateBody {
  state: "open" | "closed";
  reason: GitHubCloseReason | null;
}

/** issue・PR のラベルを置き換える（PUT …/github/items/:number/labels。付けるラベルすべて） */
export interface GitHubLabelsBody {
  labels: string[];
}

/** 新しい issue（POST …/github/issues） */
export interface GitHubNewIssueBody {
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
}

/** 作った issue */
export interface GitHubCreatedIssue {
  number: number;
  url: string;
}

/** PR のレビューを送る（POST …/github/pulls/:number/reviews。commit_id は見ていた最新のコミット） */
export interface GitHubReviewBody {
  event: GitHubReviewEvent;
  body: string;
  comments: GitHubReviewDraftComment[];
  commit_id: string | null;
}

/** 行のスレッドへの返信（POST …/github/pulls/:number/threads/:thread/replies） */
export interface GitHubThreadReplyBody {
  body: string;
}

/** 行のスレッドを解決済みにする / 戻す（POST …/github/pulls/:number/threads/:thread/resolve） */
export interface GitHubThreadResolveBody {
  resolved: boolean;
}

/** PR をマージする（POST …/github/pulls/:number/merge。sha は確認で見ていた最新のコミット。その後に積まれていたら GitHub が断る） */
export interface GitHubMergeBody {
  method: GitHubMergeMethod;
  sha: string | null;
}

/** マージの結果（sha はできたコミット） */
export interface GitHubMergeResult {
  sha: string | null;
}

/** PR のチェックアウト（POST …/github/pulls/:number/checkout。応答は GitHubPullWorktree） */
export interface GitHubCheckoutBody {
  place: GitHubCheckoutPlace;
}

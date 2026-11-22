// Git の状態・差分・履歴・ブランチの操作（とまだ分けていないワークツリー・PR・GitHub の形。P8-2 で worktrees・github へ）
import type { WorktreeEnv } from "@shared/worktrees/envTypes";
import type { GitChangeKind, GitOperation } from "./labels";

export type { GitChangeKind, GitOperation };

export interface GitFileChange {
  /** リポジトリの中のパス */
  path: string;
  /** 名前を変えたときの元のパス */
  old_path?: string;
  kind: GitChangeKind;
}

/** プロジェクトのフォルダの Git の状態（repo が false なら Git で管理されていない） */
export type GitStatus =
  | { repo: false }
  | {
      repo: true;
      /** いまのブランチ（コミット前・ブランチから外れているときは null） */
      branch: string | null;
      /** 追いかけているリモートのブランチ（例: origin/main。まだなければ null） */
      upstream: string | null;
      /** プッシュ先のリモート（origin）があるか */
      has_origin: boolean;
      ahead: number;
      behind: number;
      /** ステージされている変更 */
      staged: GitFileChange[];
      /** ステージされていない変更（未追跡のファイルも含む） */
      unstaged: GitFileChange[];
      /** 競合しているファイル */
      conflicts: GitFileChange[];
      /** 途中で止まっている操作（マージ・リベースなどで衝突したとき。なければ null） */
      operation: GitOperation | null;
    };

/** 1 つのファイルの差分（unified 形式） */
export interface GitDiff {
  diff: string;
  /** バイナリのファイル（差分は出せない） */
  binary: boolean;
  /** 大きすぎて途中で切った */
  truncated: boolean;
}

/** 差分の元の中身（GET /git/original。変更タブで差分から編集するとき、左に並べる。元にないファイルは空） */
export interface GitOriginal {
  content: string;
  /** バイナリのファイル（中身は出せない） */
  binary: boolean;
  /** 大きすぎて読まなかった */
  truncated: boolean;
}

/** 履歴の 1 つのコミット（一覧に出すもの） */
export interface GitCommit {
  hash: string;
  /** 親のコミット（マージなら 2 つ以上、最初のコミットなら空） */
  parents: string[];
  author: string;
  email: string;
  /** 作った時刻（ISO） */
  date: string;
  /** このコミットを指すブランチ・タグ（例: "HEAD -> main"・"origin/main"・"tag: v1.0"） */
  refs: string[];
  subject: string;
}

/** 履歴（新しい順。more が true ならまだ続きがある） */
export interface GitLog {
  commits: GitCommit[];
  more: boolean;
}

/** コミットの詳細（メッセージの全文と、変わったファイル） */
export interface GitCommitDetail extends GitCommit {
  body: string;
  committer: string;
  committed_at: string;
  files: GitFileChange[];
}

/** ブランチ・リモート・タグ・stash（履歴の左の一覧） */
export interface GitRefs {
  /** 手元のブランチ（current: いまのブランチ。ahead・behind は追いかけているリモートとの差） */
  branches: {
    name: string;
    hash: string;
    current: boolean;
    upstream: string | null;
    ahead: number;
    behind: number;
    /** このブランチを取り出している作業場所（本体・ワークツリーのフォルダ。どこにも取り出していなければ null） */
    worktree: string | null;
  }[];
  /** リモートごとのブランチ（name は "origin/main" の形。github は GitHub を指す remote か。札に GitHub のマークを出す） */
  remotes: { name: string; github: boolean; branches: { name: string; hash: string }[] }[];
  tags: { name: string; hash: string }[];
  /** stash（ref は "stash@{0}" の形） */
  stashes: { ref: string; hash: string; message: string }[];
}

/** 新しいワークツリーのブランチ名の案を頼む（やりたいことの概要） */
export interface BranchSuggestBody {
  summary: string;
}

/** ブランチ名の案（Git のブランチ名に使える形にそろえ、いまあるブランチと同じものは除いたもの） */
export interface BranchSuggestions {
  branches: string[];
}

/** git のワークツリー（同じリポジトリの別のブランチを、別のフォルダに取り出したもの） */
export interface GitWorktree {
  /** 作業するフォルダ（プロジェクトのフォルダがリポジトリの中のフォルダなら、ワークツリーの中の同じ位置のフォルダ。チャットの worktree_path・?worktree= はこれ） */
  path: string;
  /** ワークツリーの一番上のフォルダ（git が取り出している場所。プロジェクトのフォルダがリポジトリの一番上なら path と同じ） */
  root: string;
  /** 取り出しているブランチ（ブランチから外れていれば null） */
  branch: string | null;
  head: string;
  /** 本体（最初に作ったフォルダ。消せない） */
  main: boolean;
  locked: boolean;
  /** フォルダがなくなっていて、片付けられる */
  prunable: boolean;
  /** ワークツリーの実行環境（ポートの帯・組の名前。一覧の API だけが付ける。覚えのないワークツリー（Kickoff の外で作ったものなど）・本体は null） */
  env?: WorktreeEnv | null;
  /** この作業場所に保存された色相 */
  hue?: number;
}

/** ワークツリーを消す前の確かめ（コミットしていない変更・プッシュしていないコミット） */
export interface WorktreeRemovalInfo {
  branch: string | null;
  /** コミットしていない変更のファイル数（フォルダがなくなっていれば 0） */
  changes: number;
  /** どのリモートにもないコミットの数（リモートがなければ 0） */
  unpushed: number;
  /** このブランチにしかない（ほかのブランチにもリモートにもない）コミットの数。ブランチも消すとなくなる */
  only_here: number;
  /** リモートの追跡先があるか（一度でもプッシュしたか） */
  pushed: boolean;
  /** リポジトリにリモートがあるか（なければプッシュの話はしない） */
  has_remote: boolean;
  /** Docker タブの「DB で開く」でこのワークツリーの DB から作った DB クライアントの接続（消す確認の「この接続も消す」） */
  db_connections: { id: number; name: string }[];
}

/**
 * ワークツリーの PR の知らせ（ワークツリーのブランチのいちばん新しい PR が、GitHub でマージされた・マージせずに閉じられた）。
 * ワークツリーを片付けるまで出し続ける。dismissed = 確認を閉じた（同じ PR では確認を出し直さず、印から開き直す）
 */
export interface WorktreePrNotice {
  project_id: number;
  /** ワークツリーの作業するフォルダ（GitWorktree の path。チャットの worktree_path と同じ） */
  worktree: string;
  branch: string;
  pr: { number: number; title: string; url: string; state: "MERGED" | "CLOSED" };
  dismissed: boolean;
}

/** ブランチの PR（GitHub。gh で調べる） */
export interface PullRequestInfo {
  number: number;
  url: string;
  title: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  is_draft: boolean;
}

/**
 * 履歴の左の一覧・コミットの札の右クリックから行うブランチ・タグの操作（POST /git/branch-action の本文）。
 * ブランチは手元のブランチの名前、remote_branch は "origin/main" の形
 */
export type GitBranchAction =
  | { action: "checkout"; branch: string }
  | { action: "checkout_remote"; remote_branch: string; name: string }
  | { action: "checkout_detached"; ref: string }
  | { action: "fast_forward"; branch: string }
  | { action: "pull"; branch: string }
  | { action: "push"; branch: string }
  | { action: "push_pr"; branch: string }
  | { action: "merge"; branch: string }
  | { action: "rebase"; branch: string }
  | { action: "create_branch"; name: string; from: string; checkout: boolean }
  | { action: "create_tag"; name: string; at: string; message: string | null; push: boolean }
  | { action: "set_upstream"; branch: string; upstream: string | null }
  | { action: "rename_branch"; branch: string; name: string }
  | { action: "delete_branch"; branch: string; force: boolean; remote: boolean }
  | { action: "delete_remote_branch"; remote_branch: string }
  | { action: "push_tag"; name: string }
  | { action: "delete_tag"; name: string; remote: boolean }
  // 退避（stash）: 作業中の変更を退避する（include_untracked なら未追跡のファイルも）・戻す（pop は戻したら消す / apply は残す）・消す。ref は "stash@{0}" の形
  | { action: "stash_save"; message: string | null; include_untracked: boolean }
  | { action: "stash_pop"; ref: string }
  | { action: "stash_apply"; ref: string }
  | { action: "stash_drop"; ref: string };

/** ブランチ・タグの操作の結果（操作のあとの状態。衝突したら conflicts に衝突したファイル、PR を作ったら pr） */
export interface GitBranchActionResult {
  status: GitStatus;
  conflicts: string[];
  pr?: PullRequestInfo;
}

/** マージ・リベースの前の見込み（up_to_date: 取り込むものがない / fast_forward: 早送りで済む / conflicts: 衝突しそうなファイル） */
export interface GitMergePreview {
  up_to_date: boolean;
  fast_forward: boolean;
  conflicts: string[];
}

/** 途中で止まっている操作をどうするか（abort: 取りやめて元に戻す / continue: 続ける / skip: このコミットを飛ばす（リベースなど）） */
export type GitOperationAction = "abort" | "continue" | "skip";

/** 衝突したファイルの解き方（ours: こちらの版 / theirs: 取り込む側の版 / mark: いまの中身で解決済みにする） */
export type GitConflictResolution = "ours" | "theirs" | "mark";

/** 行の変更の記録（git blame）の 1 つのコミット。uncommitted はまだコミットしていない行（作業中の変更）、you は自分（git の user.email）が作ったもの */
export interface GitBlameCommit {
  hash: string;
  author: string;
  email: string;
  /** 作った時刻（ISO） */
  date: string;
  summary: string;
  uncommitted: boolean;
  you: boolean;
}

/** ファイルの行ごとの変更の記録（lines[i] は i + 1 行目のコミットの commits の位置）。Git で管理していないファイルは null */
export interface GitBlame {
  commits: GitBlameCommit[];
  lines: number[];
}

/** gh に入っている GitHub のアカウント（active = gh でいま有効なもの。ok = トークンが使える） */
export interface GitHubAccount {
  login: string;
  active: boolean;
  ok: boolean;
}

/** GitHub の remote（host = GitHub のホスト（github.com など）。repo = 「持ち主/名前」） */
export interface GitHubRemote {
  name: string;
  host: string;
  repo: string;
  url: string;
}

/** プロジェクトの GitHub の連携（設定の「GitHub」に出す。選べるアカウント・remote と、いま使うもの） */
export interface ProjectGitHub {
  accounts: GitHubAccount[];
  remotes: GitHubRemote[];
  /** 自動で選ぶ remote の名前（GitHub の remote がなければ null） */
  auto_remote: string | null;
  /** いま連携しているリポジトリ（「持ち主/名前」。GitHub の remote がなければ null） */
  repo: string | null;
  /** そのリポジトリのホスト（github.com など。GitHub の remote がなければ null） */
  host: string | null;
}

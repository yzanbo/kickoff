// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// Git の状態・差分・ファイル・検索・履歴・ワークツリー・PR（エディタタブ）
/**
 * Git の変更のあるファイル（VS Code のソース管理と同じ記号）。
 * M: 変更 / A: 追加 / D: 削除 / R: 名前の変更 / C: コピー / T: 種類の変更 / U: 未追跡（新しいファイル） / !: 競合
 */
export type GitChangeKind = "M" | "A" | "D" | "R" | "C" | "T" | "U" | "!";

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

/** プロジェクトのフォルダのファイルの一覧（エクスプローラーの表示） */
export interface ProjectFiles {
  /** Git で管理している・まだ追加していないファイル（.gitignore で無視しているものは除く） */
  files: string[];
  /** .gitignore で無視しているもの（フォルダは中を開かず、まとめて 1 つ） */
  ignored: { path: string; dir: boolean }[];
  /** ファイルのない（空の）フォルダ（Git はフォルダを覚えないので files には出ない。多すぎて途中で切ったときは空） */
  empty_dirs: string[];
  /** 多すぎて途中で切った */
  truncated: boolean;
}

/** ファイルの中身（見る・編集するときに出す） */
export interface FileContent {
  content: string;
  /** 中身の指紋（保存するときに、開いたあとでほかで変わっていないか確かめる。バイナリ・途中で切ったときは空） */
  hash: string;
  /** バイナリのファイル（中身は出せない） */
  binary: boolean;
  /** 大きすぎて途中で切った */
  truncated: boolean;
}

/** プロジェクトのファイルの中を探すときの指定（VS Code の検索と同じ 3 つの切り替え） */
export interface ProjectSearchQuery {
  query: string;
  /** 大文字と小文字を区別する */
  case_sensitive: boolean;
  /** 単語単位で探す */
  whole_word: boolean;
  /** 正規表現として探す */
  regex: boolean;
  /** 含めるファイル（VS Code と同じ glob のカンマ区切り。空ならすべて） */
  include: string;
  /** 除外するファイル（glob のカンマ区切り） */
  exclude: string;
  /** .gitignore などで無視しているファイルを除く（false なら無視しているものも探す） */
  use_ignore: boolean;
}

/** 見つかった行 */
export interface SearchMatch {
  line: number;
  /** 最初に見つかった位置（1 から） */
  column: number;
  text: string;
}

/** プロジェクトのファイルの中を探した結果（ファイルごと） */
export interface ProjectSearchResult {
  files: { path: string; matches: SearchMatch[] }[];
  /** 見つかった行の数 */
  total: number;
  /** 多すぎて途中で切った */
  truncated: boolean;
}

/** 置換する行（検索の結果の行。text は結果の行の文で、いまの行と違えば置換しない） */
export interface ReplaceLine {
  line: number;
  text: string;
}

/** 検索の結果を置換する（POST /api/projects/:id/search/replace）。files の行の中の、query で見つかる部分をすべて replace にする */
export interface ProjectReplaceBody {
  query: ProjectSearchQuery;
  replace: string;
  /** 見つかった文の大文字・小文字の形に合わせる */
  preserve_case: boolean;
  files: { path: string; lines: ReplaceLine[] }[];
}

/** 置換した結果。before は置換する前の中身（元に戻すのに使う。大きすぎれば null）、hash は置換したあとの指紋 */
export interface ProjectReplaceResult {
  replaced: number;
  files: { path: string; count: number; before: string | null; hash: string }[];
  /** 置換しなかったファイル・行（理由つき） */
  skipped: { path: string; reason: string }[];
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

/** ブランチ・リモート・タグ・stash（履歴の左の一覧。Fork と同じ） */
export interface GitRefs {
  /** 手元のブランチ（current: いまのブランチ。ahead・behind は追いかけているリモートとの差） */
  branches: { name: string; hash: string; current: boolean; upstream: string | null; ahead: number; behind: number }[];
  /** リモートごとのブランチ（name は "origin/main" の形） */
  remotes: { name: string; branches: { name: string; hash: string }[] }[];
  tags: { name: string; hash: string }[];
  /** stash（ref は "stash@{0}" の形） */
  stashes: { ref: string; hash: string; message: string }[];
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
}

/** ブランチの PR（GitHub。gh で調べる） */
export interface PullRequestInfo {
  number: number;
  url: string;
  title: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  is_draft: boolean;
}

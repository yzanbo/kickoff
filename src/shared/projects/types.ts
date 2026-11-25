import type { ProviderId } from "@shared/settings/types";
import type { ProjectKind } from "./kinds";

/** 圧縮前指示・圧縮後指示の長さの上限（文字。設定の共通の指示・プロジェクトのそれぞれ） */
export const COMPACT_PROMPT_MAX = 4000;

export interface Project {
  id: number;
  name: string;
  /** 概要（ないは null。チャットのシステムプロンプトに入れる） */
  description: string | null;
  repo_path: string;
  provider: ProviderId;
  /** 参照資料（AI がいつでも読めるフォルダ・ファイル。絶対パス） */
  reference_paths: ProjectReference[];
  /** サイドバーでの並び順（小さいほど前） */
  position: number;
  /** 上に固定している */
  pinned: boolean;
  /** しまった日時（アーカイブ。null なら出す。サイドバー・切り替え・全プロジェクトの画面に出さない） */
  archived_at: string | null;
  /** プロジェクトの色（色相 0〜359。作ったときに、ほかと被らない色を選ぶ。編集で変えられる） */
  hue: number;
  /** タグ（仕事・プライベートなど。前後の空白を除き、重複なし。サイドバー・全プロジェクトの画面の絞り込みに使う） */
  tags: string[];
  /** ノートの親フォルダの下の、このプロジェクトのフォルダ名（初めてノートを使ったときに、プロジェクト名から決めて覚える。名前を変えてもノートを見失わない） */
  note_folder: string | null;
  /** ノートのフォルダを、このプロジェクトだけ別の場所にする（絶対パス。null なら親フォルダ / note_folder） */
  note_dir: string | null;
  /** このプロジェクトの圧縮前指示（会話を圧縮する前に AI に送る指示。設定の共通の指示のあとにつなぐ。null ならなし） */
  pre_compact_prompt: string | null;
  /** このプロジェクトの圧縮後指示（会話を圧縮したあとに AI に送る指示。設定の共通の指示のあとにつなぐ。null ならなし） */
  post_compact_prompt: string | null;
  /** このプロジェクトの圧縮前指示を送るか（false なら文を残したまま送らない） */
  pre_compact_enabled: boolean;
  /** このプロジェクトの圧縮後指示を送るか（false なら文を残したまま送らない） */
  post_compact_enabled: boolean;
  /** GitHub で使うアカウント（gh に入っているアカウントのログイン名。null なら gh でいま有効なもの） */
  github_account: string | null;
  /** 連携先の GitHub のリポジトリの remote の名前（null なら自動: gh repo set-default → upstream → origin） */
  github_remote: string | null;
  /** ワークツリーの PR がマージされた・閉じられたことを見張るか */
  pr_watch: boolean;
  /** 作業場所でいま取り出しているブランチと既定のブランチの CI（GitHub Actions）が落ちたら知らせるか */
  ci_watch: boolean;
  /** 種類（null なら利用者が作ったプロジェクト。種類があれば Kickoff が用意するプロジェクト（共通）。判定は @shared/projects/kinds の isUserProject・isListedProject） */
  kind: ProjectKind | null;
  created_at: string;
}

/** 参照資料の 1 件（AI は読むだけで、書き込めない） */
export interface ProjectReference {
  path: string;
  kind: "folder" | "file";
}

/** 既存フォルダの点検結果（取り込みダイアログ用） */
export interface FolderInspection {
  path: string;
  exists: boolean;
  is_directory: boolean;
  is_git: boolean;
  git_root: string | null;
  has_commits: boolean;
  branch: string | null;
  remote_url: string | null;
  dirty: boolean;
  /** フォルダの中が空か（.DS_Store だけも空とみなす。フォルダを変えるとき、中身を移すつもりで空のフォルダを選んでいないか確かめる） */
  empty: boolean;
  /** git のリポジトリの中のフォルダで、親のリポジトリがこの中のファイルを管理しているか（していれば、このフォルダで別のリポジトリとして git の管理を始められない） */
  parent_tracked: boolean;
  suggested_name: string;
  registered_project_id?: number | null;
}

// ---- HTTP API の本文と応答（コアのルートと画面で同じものを使う） ----

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

/**
 * プロジェクトのフォルダ（本体）を変える（PUT /api/projects/:id/repo-path）。取り込みと同じ決まりで、git のルートのフォルダを指す。
 * git でない・コミットがないフォルダは init_git で初期化に同意したときだけ
 */
export interface ProjectRepoPathBody {
  path: string;
  init_git?: boolean;
}

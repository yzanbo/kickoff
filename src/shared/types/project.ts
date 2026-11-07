// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { ChatOptionsPatch } from "./chat";
import type { ProviderId } from "./settings";

export interface Project {
  id: number;
  name: string;
  description: string;
  repo_path: string;
  provider: ProviderId;
  /** このプロジェクトの既定（書いていない項目はアプリ全体の設定に従う） */
  chat_defaults: ChatOptionsPatch;
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
  /** メモの親フォルダの下の、このプロジェクトのフォルダ名（初めてメモを使ったときに、プロジェクト名から決めて覚える。名前を変えてもメモを見失わない） */
  memo_folder: string | null;
  /** メモのフォルダを、このプロジェクトだけ別の場所にする（絶対パス。null なら親フォルダ / memo_folder） */
  memo_path: string | null;
  /** このプロジェクトの圧縮前指示（会話を圧縮する前に AI に送る指示。設定の共通の指示のあとにつなぐ。null ならなし） */
  pre_compact_prompt: string | null;
  /** このプロジェクトの圧縮後指示（会話を圧縮したあとに AI に送る指示。設定の共通の指示のあとにつなぐ。null ならなし） */
  post_compact_prompt: string | null;
  /** このプロジェクトの圧縮前指示を送るか（false なら文を残したまま送らない） */
  pre_compact_enabled: boolean;
  /** このプロジェクトの圧縮後指示を送るか（false なら文を残したまま送らない） */
  post_compact_enabled: boolean;
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

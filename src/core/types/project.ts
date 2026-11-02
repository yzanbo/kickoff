// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { EffortLevel, PermissionChoice, Phase, ProviderId, TaskStatus } from "./phases.js";

export interface Project {
  id: number;
  name: string;
  description: string;
  repo_path: string;
  provider: ProviderId;
  test_command: string;
  deploy_instructions: string;
  auto_commit: number; // SQLite の真偽値（0 / 1）
  /** セクションごとの書き込みできるフォルダ（リポジトリからの相対パス。未指定なら既定の docs） */
  write_scopes: WriteScopes;
  /** このプロジェクトの既定（書いていない項目はアプリ全体の設定に従う） */
  defaults: ProjectDefaults;
  /** 参照資料（AI がいつでも読めるフォルダ・ファイル。絶対パス） */
  references: ProjectReference[];
  /** サイドバーでの並び順（小さいほど前） */
  position: number;
  /** 上に固定している（SQLite の真偽値 0 / 1） */
  pinned: number;
  /** しまった日時（アーカイブ。null なら出す。サイドバー・切り替え・全プロジェクトの画面に出さない） */
  archived_at: string | null;
  /** プロジェクトの色（色相 0〜359。作ったときに、ほかと被らない色を選ぶ。編集で変えられる） */
  hue: number;
  created_at: string;
  updated_at: string;
}

/**
 * プロジェクトごとの既定。キーがなければアプリ全体の設定に従う。
 * effort の null は「セクションに合わせる」、permission の "phase" も同じ意味。
 */
export interface ProjectDefaults {
  model?: string;
  effort?: EffortLevel | null;
  permission?: PermissionChoice;
  fastMode?: boolean;
  /** 新しいチャットのセクション（なければ直近のチャットと同じ） */
  section?: Phase;
}

/** 参照資料の 1 件（AI は読むだけで、書き込めない） */
export interface ProjectReference {
  path: string;
  kind: "folder" | "file";
}

/** 書き込み範囲を制限するセクション */
export const SCOPED_SECTIONS = ["requirements", "schedule"] as const;
export type ScopedSection = (typeof SCOPED_SECTIONS)[number];
export type WriteScopes = Partial<Record<ScopedSection, string[]>>;

export interface ProjectSummary extends Project {
  task_counts: Record<TaskStatus, number>;
  /** フェーズごとのタスク数（done は完了したもの） */
  phase_task_counts: Record<Phase, { total: number; done: number }>;
  total_cost_usd: number;
  active_runs: number;
}
/** 既存フォルダの点検結果（取り込みダイアログ用） */
export interface WorkspaceInspection {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  isGit: boolean;
  gitRoot: string | null;
  hasCommits: boolean;
  branch: string | null;
  remoteUrl: string | null;
  dirty: boolean;
  suggestedName: string;
  registered_project_id?: number | null;
}

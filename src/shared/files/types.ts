// プロジェクトのファイルの中の検索と置換の形（一覧の形 ProjectFiles は @shared/foundation/fileTypes、検索の指定 ProjectSearchQuery は @shared/foundation/search/searchMatch）
import type { ProjectSearchQuery } from "@shared/foundation/search/searchMatch";

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
interface ReplaceLine {
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

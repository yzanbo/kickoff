// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// メモ（プロジェクトごとのメモのフォルダの中の Markdown。保存先はプロジェクトの外。設定の memos_dir の下に、プロジェクトごとのフォルダを作る）

/** メモのフォルダの中の 1 件（パスはメモのフォルダからの相対。区切りは /） */
export interface MemoEntry {
  path: string;
  /** フォルダか */
  dir: boolean;
  /** 最後に変えた時刻（ISO 8601） */
  modified_at: string;
}

/** プロジェクトのメモの一覧（GET /api/projects/:id/memos） */
export interface MemoList {
  /** このプロジェクトのメモのフォルダ（絶対パス） */
  dir: string;
  /** フォルダがあるか（まだ 1 つもメモを作っていなければ、ない） */
  exists: boolean;
  /** フォルダとファイル（隠しファイルは除く。パスの順） */
  entries: MemoEntry[];
  /** 多すぎて途中で切った */
  truncated: boolean;
}

/** メモの保存先の既定（GET /api/memos/defaults。設定の画面で、まだ選んでいないときに出す） */
export interface MemoDefaults {
  /** 設定の memos_dir が null のときに使う親フォルダ（製品版と開発版で別） */
  default_dir: string;
}

/**
 * そのフォルダをメモのフォルダにしているプロジェクト（GET /api/memos/users。新しいプロジェクトのダイアログ・プロジェクトの設定で、
 * ほかのプロジェクトとメモのフォルダが被っていると知らせる。まだメモのフォルダを決めていないプロジェクトは数えない）
 */
export interface MemoDirUsers {
  project_ids: number[];
}

/** メモの中の文で見つかった行（GET /api/memos/search。⌘K の「メモ内の文言」）。text は行の文（長ければ前後を切る）、match_start / match_end は text の中の見つかった所 */
export interface MemoSearchHit {
  project_id: number;
  /** メモのフォルダからの相対パス */
  path: string;
  line: number;
  text: string;
  match_start: number;
  match_end: number;
}

/** メモの中の文を探した結果（多すぎれば途中で切る） */
export interface MemoSearchResult {
  hits: MemoSearchHit[];
  truncated: boolean;
}

/** 作った・動かしたメモ（メモのフォルダからの相対パス） */
export interface MemoRef {
  path: string;
}

/** メモの拡張子（新しいメモ・チャットから作るメモ） */
export const MEMO_EXTENSION = ".md";

/** AI のフォルダの整理案の 1 件（名前の変更・ほかのフォルダへの移動。行き先のフォルダがなければ動かすときに作る） */
export interface MemoPlanMove {
  from: string;
  to: string;
  /** なぜそうするか（短い文） */
  reason: string;
}

/** AI のメモのフォルダの整理案（POST /api/projects/:id/memos/ai-plan。動かしはしない。skipped は、ないメモ・重なる行き先など、使えなかった案の数） */
export interface MemoPlan {
  moves: MemoPlanMove[];
  skipped: number;
}

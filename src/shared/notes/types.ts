// ノート（プロジェクトごとのノートのフォルダの中の Markdown。保存先はプロジェクトの外。設定の notes_dir の下に、プロジェクトごとのフォルダを作る）

/** ノートのフォルダの中の 1 件（パスはノートのフォルダからの相対。区切りは /） */
export interface NoteEntry {
  path: string;
  /** フォルダか */
  dir: boolean;
  /** 最後に変えた時刻（ISO 8601） */
  modified_at: string;
}

/** プロジェクトのノートの一覧（GET /api/projects/:id/notes） */
export interface NoteList {
  /** このプロジェクトのノートのフォルダ（絶対パス） */
  dir: string;
  /** フォルダがあるか（まだ 1 つもノートを作っていなければ、ない） */
  exists: boolean;
  /** フォルダとファイル（隠しファイルは除く。パスの順） */
  entries: NoteEntry[];
  /** 多すぎて途中で切った */
  truncated: boolean;
}

/** ノートの保存先の既定（GET /api/notes/defaults。設定の画面で、まだ選んでいないときに出す） */
export interface NoteDefaults {
  /** 設定の notes_dir が null のときに使う親フォルダ（製品版と開発版で別） */
  default_dir: string;
}

/**
 * そのフォルダをノートのフォルダにしているプロジェクト（GET /api/notes/users。新しいプロジェクトのダイアログ・プロジェクトの設定で、
 * ほかのプロジェクトとノートのフォルダが被っていると知らせる。まだノートのフォルダを決めていないプロジェクトは数えない）
 */
export interface NoteDirUsers {
  project_ids: number[];
}

/** ノートの中の文で見つかった行（GET /api/notes/search。⌘K の「ノート内の文言」）。text は行の文（長ければ前後を切る）、match_start / match_end は text の中の見つかった所 */
export interface NoteSearchHit {
  project_id: number;
  /** ノートのフォルダからの相対パス */
  path: string;
  line: number;
  text: string;
  match_start: number;
  match_end: number;
}

/** ノートの中の文を探した結果（多すぎれば途中で切る） */
export interface NoteSearchResult {
  hits: NoteSearchHit[];
  truncated: boolean;
}

/** 作った・動かしたノート（ノートのフォルダからの相対パス） */
export interface NoteRef {
  path: string;
}

/** ノートの拡張子（新しいノート・チャットから作るノート） */
export const NOTE_EXTENSION = ".md";

/** AI のフォルダの整理案の 1 件（名前の変更・ほかのフォルダへの移動。行き先のフォルダがなければ動かすときに作る） */
export interface NotePlanMove {
  from: string;
  to: string;
  /** なぜそうするか（短い文） */
  reason: string;
}

/** AI のノートのフォルダの整理案（POST /api/projects/:id/notes/ai-plan。動かしはしない。skipped は、ないノート・重なる行き先など、使えなかった案の数） */
export interface NotePlan {
  moves: NotePlanMove[];
  skipped: number;
}

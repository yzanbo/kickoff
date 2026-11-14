// 内蔵ターミナル（パネルのタブ）を API から使う形（スマホのターミナル）。シェルはコアで動き、この Mac の画面は IPC、スマホは WebSocket でつなぐ

/** 動いているシェルのタブ（GET /api/terminals） */
export interface TerminalTab {
  /** タブのキー（裏のシェルのキー） */
  key: string;
  /** どのプロジェクトのターミナルか（知らせていなければ null） */
  project_id: number | null;
  /** タブの名前 */
  title: string;
  /** シェルを始めたフォルダ */
  cwd: string;
  /** 決まったコマンドのタブならそのコマンド（ふつうのシェルは null） */
  command: string | null;
}

/** 新しいシェルを始める本文（POST /api/projects/:id/terminals。作業場所は本体なら null） */
export interface TerminalCreateBody {
  worktree_path: string | null;
  cols: number;
  rows: number;
}

/** 始めたシェル（このキーで WebSocket につなぐ） */
export interface TerminalCreated {
  key: string;
}

/** WebSocket（GET /api/terminals/:key/ws?cols=&rows=）でコアから届くもの */
export type TerminalServerMessage =
  /** つないだときのいまの画面の内容（そのあとの出力は data で届く） */
  | { type: "snapshot"; data: string }
  | { type: "data"; data: string }
  /** シェルが終わった（このあと閉じる） */
  | { type: "exit"; exit_code: number };

/** WebSocket で送るもの（見るだけの端末の input は捨てる。大きさを変えられるのはシェルの持ち主だけ） */
export type TerminalClientMessage = { type: "input"; data: string } | { type: "resize"; cols: number; rows: number };

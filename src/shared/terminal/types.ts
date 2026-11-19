// 内蔵ターミナル（パネルのタブ）を API から使う形。シェルはコアで動き、この Mac の画面もスマホも WebSocket でつなぐ

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

/**
 * 決まったコマンドで開くタブ（Docker のシェルなど）。command はログインシェルの -l -c で流し、終わってもシェルは開き直さない。
 * env はシェルに足す環境変数。つなぎ直し（すでにあるシェル）のときは使わない（流し直さない）
 */
export interface TerminalStart {
  command?: string;
  env?: Record<string, string>;
}

/** タブの持ち主と名前（コアの中の形。AI がこのプロジェクトのターミナルの出力を読むときに、タブを見分けて名前で示すため。つなぐたびに知らせる） */
export interface TerminalTabMeta {
  projectId: number | null;
  title: string;
}

/**
 * この Mac の画面のタブのシェルを用意する本文（POST /api/terminals。この Mac だけ）。そのキーのシェルがあれば meta・owner だけを覚え直し、
 * なければ cwd で始める（start があれば、そのコマンドを流すタブとして）。出力は、このあと GET /api/terminals/:key/ws でつないで受ける
 */
export interface TerminalOpenBody {
  /** タブのキー（裏のシェルのキー） */
  key: string;
  cwd: string;
  cols: number;
  rows: number;
  /** 持ち主（その画面 = wc:<WebContents の ID>。画面が消えた・読み込み直したら、メインプロセスがその持ち主のシェルを止める） */
  owner: string;
  start: { command: string | null; env: Record<string, string> | null } | null;
  meta: { project_id: number | null; title: string } | null;
}

/** シェルの持ち主だけを替える本文（この Mac の画面のタブを別ウィンドウへ移す・戻すとき。PUT /api/terminals/:key/owner） */
export interface TerminalOwnerBody {
  /** 新しい持ち主（その画面 = wc:<WebContents の ID>） */
  owner: string;
}

/** 用意したシェル（created: 新しく始めたか） */
export interface TerminalOpened {
  created: boolean;
}

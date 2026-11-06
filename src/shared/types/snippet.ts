// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// 定型文（チャット欄の上の帯から入力欄に入れる・すぐ送る、よく使う文。一覧は 1 つで、1 件ずつ使える範囲を持つ）

/** 定型文（snippets の表） */
export interface Snippet {
  id: number;
  /** 使えるプロジェクト（null なら共通 = すべてのプロジェクト） */
  project_id: number | null;
  /** 帯のボタンに出す短い名前（null なら本文の 1 行目） */
  label: string | null;
  /** 入力欄に入れる文 */
  text: string;
  /** 並び順（すべての定型文で 1 つの並び。小さいほど左・上） */
  position: number;
  created_at: string;
  updated_at: string;
}

/** 名前の長さの上限 */
export const SNIPPET_LABEL_MAX = 40;
/** 本文の長さの上限 */
export const SNIPPET_TEXT_MAX = 20_000;

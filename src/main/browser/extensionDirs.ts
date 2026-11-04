import path from "node:path";

// 拡張機能のフォルダの判定（Electron に依らないので、テストできる）

/**
 * 消してよい拡張機能のフォルダか: Kickoff が取得・写した拡張機能を入れる保存先（root）の、すぐ下のフォルダだけ。
 * 画面から届いたパスは信じず、".." などを解決してから比べる（保存先そのもの・保存先の外・名前が保存先で始まるだけの隣のフォルダ・
 * 拡張機能の中のフォルダは消さない）
 */
export function isManagedExtensionDir(root: string, target: string): boolean {
  return path.dirname(path.resolve(target)) === path.resolve(root);
}

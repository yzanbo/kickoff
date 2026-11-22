// フォルダの中のファイルの一覧・中身・保存・名前の変更の形（ファイルのタブとノートが同じ形を使う。作るのはコアの @/foundation/core/files/folderFiles.ts）

/** ファイルの中身（見る・編集するときに出す） */
export interface FileContent {
  content: string;
  /** 中身の指紋（保存するときに、開いたあとでほかで変わっていないか確かめる。バイナリ・途中で切ったときは空） */
  hash: string;
  /** バイナリのファイル（中身は出せない） */
  binary: boolean;
  /** 大きすぎて途中で切った */
  truncated: boolean;
}

/** ファイルを保存した結果（PUT /api/projects/:id/file）。hash は保存したあとの中身の指紋（次に保存するときの base_hash） */
export interface SavedFile {
  hash: string;
}

/** ファイル・フォルダの名前を変えた結果（POST /api/projects/:id/file/rename）。path は変えたあとのパス（作業場所から） */
export interface RenamedFile {
  path: string;
}

/** プロジェクトのフォルダのファイルの一覧（エクスプローラーの表示） */
export interface ProjectFiles {
  /** Git で管理している・まだ追加していないファイル（.gitignore で無視しているものは除く） */
  files: string[];
  /** .gitignore で無視しているもの（フォルダは中を開かず、まとめて 1 つ） */
  ignored: { path: string; dir: boolean }[];
  /** ファイルのない（空の）フォルダ（Git はフォルダを覚えないので files には出ない。多すぎて途中で切ったときは空） */
  empty_dirs: string[];
  /** 多すぎて途中で切った */
  truncated: boolean;
}

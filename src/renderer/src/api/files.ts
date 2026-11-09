import type { FileContent, ProjectFiles, ProjectReplaceBody, ProjectReplaceResult, ProjectSearchQuery, ProjectSearchResult, RenamedFile, SavedFile } from "@shared/types";
import { request } from "./http";
import { workdirPath, type GitTarget } from "./workdir";

/** 作業場所のファイル（エクスプローラーの一覧・中身・検索・保存・作る・名前の変更・ゴミ箱。コアの routes/files.ts） */
export const filesApi = {
  projectFiles: (target: GitTarget) => request<ProjectFiles>("GET", workdirPath(target, "/files")),
  projectFile: (target: GitTarget, path: string) => request<FileContent>("GET", workdirPath(target, "/file", { path })),
  /** ファイルを保存する（baseHash は開いたときの指紋。ほかで変わっていれば 409。null なら上書き） */
  saveProjectFile: (target: GitTarget, path: string, content: string, baseHash: string | null) =>
    request<SavedFile>("PUT", workdirPath(target, "/file"), { path, content, base_hash: baseHash }),
  /** ファイル・フォルダの名前を変える（同じフォルダの中で。同じ名前があれば 409）。変えたあとのパスを返す */
  renameProjectFile: (target: GitTarget, path: string, name: string) => request<RenamedFile>("POST", workdirPath(target, "/file/rename"), { path, name }),
  /** 新しいファイル・フォルダを作る（途中のフォルダも作る。同じ名前があれば 409） */
  createProjectFile: (target: GitTarget, path: string, dir: boolean) => request<RenamedFile>("POST", workdirPath(target, "/files"), { path, dir }),
  /** ファイル・フォルダをゴミ箱へ移す（Finder から戻せる） */
  trashProjectFile: (target: GitTarget, path: string) => request<void>("DELETE", workdirPath(target, "/file", { path })),
  searchProject: (target: GitTarget, { query, case_sensitive, whole_word, regex, include, exclude, use_ignore }: ProjectSearchQuery) =>
    request<ProjectSearchResult>("GET", workdirPath(target, "/search", { q: query, case: case_sensitive, word: whole_word, regex, include, exclude, ignore: use_ignore })),
  /** 探した結果の行を置換する（いまの行が結果の行と違えば置換しない。置換する前の中身が返るので、元に戻せる） */
  replaceInProject: (target: GitTarget, body: ProjectReplaceBody) => request<ProjectReplaceResult>("POST", workdirPath(target, "/search/replace"), body),
};

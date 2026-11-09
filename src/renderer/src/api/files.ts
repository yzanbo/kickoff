import type { FileContent, ProjectFiles, ProjectSearchQuery, ProjectSearchResult, RenamedFile, SavedFile } from "@shared/types";
import { request } from "./http";
import { workdirPath, type GitTarget } from "./workdir";

/** 作業場所のファイル（エクスプローラーの一覧・中身・検索・保存。コアの routes/files.ts） */
export const filesApi = {
  projectFiles: (target: GitTarget) => request<ProjectFiles>("GET", workdirPath(target, "/files")),
  projectFile: (target: GitTarget, path: string) => request<FileContent>("GET", workdirPath(target, "/file", { path })),
  /** ファイルを保存する（baseHash は開いたときの指紋。ほかで変わっていれば 409。null なら上書き） */
  saveProjectFile: (target: GitTarget, path: string, content: string, baseHash: string | null) =>
    request<SavedFile>("PUT", workdirPath(target, "/file"), { path, content, base_hash: baseHash }),
  /** ファイル・フォルダの名前を変える（同じフォルダの中で。同じ名前があれば 409）。変えたあとのパスを返す */
  renameProjectFile: (target: GitTarget, path: string, name: string) => request<RenamedFile>("POST", workdirPath(target, "/file/rename"), { path, name }),
  searchProject: (target: GitTarget, { query, case_sensitive, whole_word, regex }: ProjectSearchQuery) =>
    request<ProjectSearchResult>("GET", workdirPath(target, "/search", { q: query, case: case_sensitive, word: whole_word, regex })),
};

// ファイルの取り決め（作業場所のファイルの一覧・中身・検索・置換・保存・作る・名前の変更・ゴミ箱）。受け口は src/features/files/core/routes/files.ts
import { blob, raw, route, type Contract, type WorkdirQuery } from "@shared/foundation/contract";
import type { FileContent, ProjectFiles, RenamedFile, SavedFile } from "@shared/foundation/fileTypes";
import type { TrashedResult } from "@shared/trash/types";
import type { ProjectReplaceBody, ProjectReplaceResult, ProjectSearchResult } from "./types";

/** ファイルを指すクエリ（作業場所からの相対パス） */
type PathQuery = WorkdirQuery & { path: string };

/** ファイルの中を探すクエリ（q は探す文、真偽は大文字・小文字の区別・単語単位・正規表現・.gitignore で無視しているものを除く） */
type FileSearchQuery = WorkdirQuery & { q: string; case: boolean; word: boolean; regex: boolean; include: string; exclude: string; ignore: boolean };

export const filesContract = {
  /** ファイルの一覧（Git で管理していないフォルダも同じ形） */
  "GET /api/projects/:projectId/files": route<never, ProjectFiles, WorkdirQuery>({ workdir: true }),
  /** ファイルの中身（作業場所の外・外を指すリンクは 400、なければ 404） */
  "GET /api/projects/:projectId/file": route<never, FileContent, PathQuery>({ workdir: true }),
  /** 画像のファイルの中身（プレビュー。icns は中の PNG） */
  "GET /api/projects/:projectId/file/image": blob<PathQuery>({ workdir: true }),
  /**
   * HTML のファイルのプレビューが読むファイル（ページ自身と、相対パスの CSS・画像）。画面は <base> をそのファイルのフォルダに向ける。
   * 相対パスで解くと ?worktree= が落ちるので、作業場所はパスの 1 段目（"-" = 本体 / ワークツリーのフォルダを 1 段に符号化したもの）
   */
  "GET /api/projects/:projectId/file/asset/:place/*": raw(),
  /** ファイルの中を探す（正規表現・含める / 除外するファイルの書き方が正しくなければ 400） */
  "GET /api/projects/:projectId/search": route<never, ProjectSearchResult, FileSearchQuery>({ workdir: true }),
  /** 探した結果の行を置換する（いまの行が結果の行と違えば置換しない。置換する前の中身を返すので、画面が元に戻せる） */
  "POST /api/projects/:projectId/search/replace": route<ProjectReplaceBody, ProjectReplaceResult, WorkdirQuery>({ workdir: true }),
  /** ファイルを保存する（開いたときの指紋 base_hash といまの中身が違えば 409。null なら上書き） */
  "PUT /api/projects/:projectId/file": route<{ path: string; content: string; base_hash: string | null }, SavedFile, WorkdirQuery>({ workdir: true }),
  /** ファイル・フォルダの名前を変える（同じフォルダの中で。使えない名前・外は 400、ない 404、同じ名前がある 409）。変えたあとのパス */
  "POST /api/projects/:projectId/file/rename": route<{ path: string; name: string }, RenamedFile, WorkdirQuery>({ workdir: true }),
  /** 新しいファイル・フォルダを作る（途中のフォルダも作る。使えない名前・外は 400、同じ名前がある 409） */
  "POST /api/projects/:projectId/files": route<{ path: string; dir?: boolean }, RenamedFile, WorkdirQuery>({ status: 201, workdir: true }),
  /** ファイル・フォルダを Kickoff のゴミ箱へ入れる（3 日は元に戻せる。外は 400、ない 404）。入れたゴミ箱の ID */
  "DELETE /api/projects/:projectId/file": route<never, TrashedResult, PathQuery>({ workdir: true }),
} as const satisfies Contract;

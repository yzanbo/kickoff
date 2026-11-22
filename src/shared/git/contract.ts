// Git の取り決め（作業場所の状態・差分・ステージ・コミット・プッシュ・プル・履歴・ブランチの操作）。受け口は src/features/git/core/routes/git.ts
// 変える操作は、終わったあとの状態（GitStatus）を返す。作業場所のブランチの PR（GET・POST …/git/pr）はまだ取り決めの外（P8-2d で github へ）
import { route, type Contract, type WorkdirQuery } from "@shared/foundation/contract";
import type {
  GitBlame,
  GitBranchAction,
  GitBranchActionResult,
  GitCommitDetail,
  GitConflictResolution,
  GitDiff,
  GitLog,
  GitMergePreview,
  GitOperationAction,
  GitOriginal,
  GitRefs,
  GitStatus,
} from "./types";

/** 変更のあるファイルを指すクエリ（old は名前を変えたときの元のパス。staged ならステージしたもの） */
type DiffQuery = WorkdirQuery & { path: string; old?: string; staged: boolean };
/** パスを並べた本文（ステージ・ステージの取り消し・変更を捨てる） */
type PathsBody = { paths: string[] };

export const gitContract = {
  "GET /api/projects/:projectId/git/status": route<never, GitStatus, WorkdirQuery>({ workdir: true }),
  /** 変更のあるファイルの差分 */
  "GET /api/projects/:projectId/git/diff": route<never, GitDiff, DiffQuery>({ workdir: true }),
  /** 差分の元の中身（差分から編集するとき、左に並べる。staged なら HEAD、そうでなければ索引） */
  "GET /api/projects/:projectId/git/original": route<never, GitOriginal, DiffQuery>({ workdir: true }),
  /** 行ごとの変更の記録（git blame。Git で管理していないファイルは null） */
  "GET /api/projects/:projectId/git/blame": route<never, GitBlame | null, WorkdirQuery & { path: string }>({ workdir: true }),
  "POST /api/projects/:projectId/git/stage": route<PathsBody, GitStatus, WorkdirQuery>({ workdir: true }),
  "POST /api/projects/:projectId/git/unstage": route<PathsBody, GitStatus, WorkdirQuery>({ workdir: true }),
  /** 変更を捨てる（元に戻す。未追跡のファイルは消す） */
  "POST /api/projects/:projectId/git/discard": route<PathsBody, GitStatus, WorkdirQuery>({ workdir: true }),
  "POST /api/projects/:projectId/git/commit": route<{ message: string; amend?: boolean }, GitStatus, WorkdirQuery>({ workdir: true }),
  "POST /api/projects/:projectId/git/push": route<never, GitStatus, WorkdirQuery>({ workdir: true }),
  /** 履歴の左の一覧（ブランチ・リモート・タグ・退避） */
  "GET /api/projects/:projectId/git/refs": route<never, GitRefs, WorkdirQuery>({ workdir: true }),
  /** 履歴（新しい順に 200 ずつ。skip で続き） */
  "GET /api/projects/:projectId/git/log": route<never, GitLog, WorkdirQuery & { skip: number }>({ workdir: true }),
  "GET /api/projects/:projectId/git/commits/:hash": route<never, GitCommitDetail, WorkdirQuery>({ workdir: true }),
  "GET /api/projects/:projectId/git/commits/:hash/diff": route<never, GitDiff, WorkdirQuery & { path: string; old?: string }>({ workdir: true }),
  /** フェッチ（リモートの情報を取ってくる。作業中のファイルは変えない。auto は裏の自動のフェッチ: 前から 60 秒以内・操作中ならコアが飛ばし、失敗も知らせずに今の状態を返す） */
  "POST /api/projects/:projectId/git/fetch": route<{ auto?: boolean }, GitStatus, WorkdirQuery>({ workdir: true }),
  /** プル（早送りで最新にする） */
  "POST /api/projects/:projectId/git/pull": route<never, GitStatus, WorkdirQuery>({ workdir: true }),
  /** ブランチ・タグの操作。衝突して止まったら conflicts に衝突したファイル（push_pr なら作った PR も） */
  "POST /api/projects/:projectId/git/branch-action": route<GitBranchAction, GitBranchActionResult, WorkdirQuery>({ workdir: true }),
  /** マージ・リベースの前の見込み（取り込むものがあるか・早送りで済むか・衝突しそうなファイル） */
  "GET /api/projects/:projectId/git/merge-preview": route<never, GitMergePreview, WorkdirQuery & { branch: string }>({ workdir: true }),
  /** 途中で止まっているマージ・リベースなどを、取りやめる・続ける・飛ばす */
  "POST /api/projects/:projectId/git/operation": route<{ action: GitOperationAction }, GitBranchActionResult, WorkdirQuery>({ workdir: true }),
  /** 衝突したファイルを解く（こちらの版・取り込む側の版を使う・いまの中身で解決済みにする） */
  "POST /api/projects/:projectId/git/resolve": route<{ path: string; how: GitConflictResolution }, GitStatus, WorkdirQuery>({ workdir: true }),
} as const satisfies Contract;

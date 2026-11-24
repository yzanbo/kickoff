// files の口 filesGit の Git の実装（contributes.ts が登録する）: 状態・変更の記号・差分のタブ・変更の一覧・帯と変更の記録を、files の形にして渡す
// （部品は filesGitParts.tsx を遅れて読む。Git の状態を読み始めたら先に読んでおく）
import type { GitFileChange, GitStatus } from "@shared/git/types";
import { useEffect } from "react";
import { lazyPart } from "@/foundation/ui/points";
import { workdirInput } from "@/foundation/ui/api/workdir";
import { workplaceKey, type WorkplaceRef } from "@/foundation/ui/workplace/workplace";
import type { BlameLines, FileChange, FilesChangesPaneProps, FilesDiffTabProps, FilesGit, FilesGitStatus } from "@/features/files/ui";
import { gitApi } from "./api";
import { blameAt, blameHover, blameLabel } from "./blameText";
import { confirmDiscard } from "./ChangeGroup";
import { changeOf, changeSelection, editedChange, groupsOf, selectedChange } from "./changes/changeGroups";
import { changeKinds } from "./changes/changeMarks";
import { useGitBlame } from "./useGitBlame";
import { useGitStatus, type GitStatusController } from "./useGitStatus";
import { useQuickDiffBase } from "./useQuickDiffBase";

/** 渡した状態（中に Git の状態と操作を持つ。files は形だけを使う） */
export type GitFilesStatus = FilesGitStatus & { readonly git: GitStatusController };
/** 渡した変更（中に Git の変更の行を持つ） */
type GitFileRef = FileChange & { readonly file: GitFileChange };

export const gitOf = (status: FilesGitStatus) => (status as GitFilesStatus).git;
export const fileOf = (change: FileChange) => (change as GitFileRef).file;

const ChangesPane = lazyPart<FilesChangesPaneProps>(() => import("./filesGitParts").then((m) => ({ default: m.FilesChangesPane })));
const DiffTab = lazyPart<FilesDiffTabProps>(() => import("./filesGitParts").then((m) => ({ default: m.FilesDiffTab })));
const toRef = (found: { file: GitFileChange; staged: boolean }): GitFileRef => ({ path: found.file.path, staged: found.staged, deleted: found.file.kind === "D", file: found.file });
const repoStatus = (status: FilesGitStatus): GitStatus | undefined => gitOf(status).status;

function useStatus(target: WorkplaceRef, active: boolean): GitFilesStatus {
  const git = useGitStatus(target, { active });
  const { status } = git;
  useEffect(() => {
    void ChangesPane.preload();
    void DiffTab.preload();
  }, []);
  return {
    git,
    version: git.version,
    repo: status ? status.repo : null,
    loading: git.loading,
    error: git.error ?? null,
    marks: changeKinds(status),
    changeOf: (path) => {
      const found = changeOf(status, path);
      return found ? toRef(found) : null;
    },
    refresh: git.refresh,
    act: async (action, paths) => void (await git.act(action, paths)),
  };
}

function useFilesQuickDiffBase(target: WorkplaceRef, path: string, status: FilesGitStatus, content: string | null): string | null {
  const current = repoStatus(status);
  return useQuickDiffBase({ target, key: `${workplaceKey(target)}:${path}`, gitStatus: current, change: changeOf(current, path), version: status.version, content });
}

/** 行ごとの変更の記録（未追跡・Git の外は出さない） */
function useFilesBlame(target: WorkplaceRef, path: string, status: FilesGitStatus, hash: string | null): BlameLines | null {
  const current = repoStatus(status);
  const enabled = Boolean(current?.repo) && changeOf(current, path)?.file.kind !== "U";
  const blame = useGitBlame({ target, key: `${workplaceKey(target)}:${path}`, path, hash, version: status.version, enabled });
  if (!blame) return null;
  return {
    at: (line, lineCount) => {
      const commit = blameAt(blame, line, lineCount);
      return commit && { label: blameLabel(commit), hover: blameHover(commit) };
    },
  };
}

export const gitForFiles: FilesGit = {
  useStatus,
  useQuickDiffBase: useFilesQuickDiffBase,
  useBlame: useFilesBlame,
  readOriginal: async (target, change) => {
    const file = fileOf(change);
    const o = await gitApi("GET /api/projects/:projectId/git/original", workdirInput(target, { path: file.path, old: file.old_path, staged: change.staged }));
    return o.binary || o.truncated ? null : o.content;
  },
  hasChange: (target, path) =>
    gitApi("GET /api/projects/:projectId/git/status", workdirInput(target)).then(
      (status) => changeOf(status, path) !== undefined,
      () => false,
    ),
  tabChange: (status, selected) => {
    const groups = groupsOf(repoStatus(status));
    const edited = editedChange(selected, groups);
    if (edited) return { kind: "edit", change: toRef(edited) };
    const diff = selectedChange(selected, groups);
    return diff ? { kind: "diff", change: toRef(diff) } : null;
  },
  changeSelection: (status, next) => changeSelection(next, groupsOf(repoStatus(status))),
  confirmDiscard,
  ChangesPane,
  DiffTab,
};

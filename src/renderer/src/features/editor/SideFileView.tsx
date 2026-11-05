import { FileDiff, SquareArrowOutUpRight } from "lucide-react";
import { useContext } from "react";
import { openProjectFile } from "@/app/router";
import { useProjects } from "@/stores/projects";
import { FileLinkContext } from "@/features/fileLinks/fileLinkContext";
import { WorktreeContext } from "@/features/worktree/worktreeContext";
import { FileView } from "./FileView";
import { changeOf } from "./sideFile";
import { useGitStatus } from "./useGitStatus";

interface Props {
  projectId: number;
  /** チャットの作業場所のワークツリーのフォルダ（本体ならなし） */
  worktree?: string;
  /** 作業場所からの相対パス */
  path: string;
  /** 目立たせる行 */
  line?: number;
}

/**
 * チャットの画面の右の欄の「ファイル」: 作業場所のファイルの中身（エディタタブと同じ FileView。編集・保存もできる）。行の番号があればその行を目立たせる。
 * 上の帯に、コミットしていない変更があれば「差分を見る」（右の欄の変更のタブのそのファイルの位置へ）と、「エディタタブで開く」
 */
export function SideFileView(props: Props) {
  return (
    <WorktreeContext.Provider value={props.worktree}>
      <SideFileBody {...props} />
    </WorktreeContext.Provider>
  );
}

function SideFileBody({ projectId, worktree, path, line }: Props) {
  const { projectsById } = useProjects();
  const git = useGitStatus(projectId, false, worktree);
  const links = useContext(FileLinkContext);
  const changed = changeOf(git.status, path) !== undefined;
  const ref = { path, ...(line ? { line } : {}) };
  return (
    <div className="side-file">
      <div className="side-file-bar">
        {changed && (
          <button type="button" className="btn btn-sm" title="このファイルのコミットしていない変更を、右の欄の「変更」で見ます" onClick={() => links?.openChanges(path)}>
            <FileDiff size={13} aria-hidden /> 差分を見る
          </button>
        )}
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => (links ? links.openInEditor(ref) : openProjectFile(projectId, { ...ref, ...(worktree ? { worktree } : {}) }))}
        >
          <SquareArrowOutUpRight size={13} aria-hidden /> エディタタブで開く
        </button>
      </div>
      <FileView
        key={`${path}:${line ?? ""}`}
        projectId={projectId}
        repoPath={projectsById.get(projectId)?.repo_path ?? ""}
        path={path}
        line={line}
        changed={changed}
        version={git.version}
        onSaved={() => void git.refresh()}
      />
    </div>
  );
}

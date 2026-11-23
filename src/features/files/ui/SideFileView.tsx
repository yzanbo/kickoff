import { FileDiff, SquareArrowOutUpRight } from "lucide-react";
import { useContext, useEffect } from "react";
import { open } from "@/foundation/ui/navigation/open";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { FileLinkContext } from "@/features/files/ui/links/fileLinkContext";
import { WorkplaceProvider } from "@/foundation/ui/workplace/workplaceContext";
import { FileView } from "./FileView";
import { setFileTabDirty } from "./fileTabs";
import { useCodeQuoteMenu } from "./useCodeQuoteMenu";
import { useFilesGitStatus } from "./filesGit";
import { PopOutTabButton } from "@/features/panel/ui/tabs/PopOutTabButton";

interface Props {
  projectId: number;
  /** チャットの作業場所のワークツリーのフォルダ（本体ならなし） */
  worktree?: string;
  /** 作業場所からの相対パス */
  path: string;
  /** 目立たせる行 */
  line?: number;
  /** 右の欄のタブ（書きかけの印を覚える。作業場所を移したとき、書きかけのタブは付け替えずに残すため。別ウィンドウにはない） */
  tabOf?: { panelKey: string; tabKey: string };
}

/**
 * チャットの画面の右の欄の「ファイル」: 作業場所のファイルの中身（ファイルタブと同じ FileView。編集・保存もできる）。行の番号があればその行を目立たせる。
 * 上の帯に、コミットしていない変更があれば「差分を見る」（右の欄の変更のタブのそのファイルの位置へ）と、「ファイルタブで開く」。
 * 中身の行の右クリックは「メインのチャット」に足すメニュー（useCodeQuoteMenu）
 */
export function SideFileView(props: Props) {
  return (
    <WorkplaceProvider value={{ projectId: props.projectId, worktree: props.worktree ?? null }}>
      <SideFileBody {...props} />
    </WorkplaceProvider>
  );
}

function SideFileBody({ projectId, worktree, path, line, tabOf }: Props) {
  const panelKey = tabOf?.panelKey;
  const tabKey = tabOf?.tabKey;
  useEffect(() => (panelKey && tabKey ? () => setFileTabDirty(panelKey, tabKey, false) : undefined), [panelKey, tabKey]);
  const { projectsById } = useProjects();
  const git = useFilesGitStatus({ projectId, worktree: worktree ?? null }, false);
  const links = useContext(FileLinkContext);
  const changed = git.changeOf(path) !== null;
  const ref = { path, ...(line ? { line } : {}) };
  const repoPath = projectsById.get(projectId)?.repo_path ?? "";
  const codeMenu = useCodeQuoteMenu(worktree ?? (repoPath || undefined));
  return (
    <div className="side-file" onContextMenu={codeMenu.onContextMenu}>
      <div className="side-file-bar bar">
        {changed && (
          <button type="button" className="btn" data-size="sm" title="このファイルのコミットしていない変更を、右の欄の「変更」で見ます" onClick={() => links?.openChanges(path)}>
            <FileDiff size={13} aria-hidden /> 差分を見る
          </button>
        )}
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          data-size="sm"
          onClick={() => (links ? links.openInEditor(ref) : open({ kind: "file", projectId, ...ref, worktree }))}
        >
          <SquareArrowOutUpRight size={13} aria-hidden /> ファイルタブで開く
        </button>
        <PopOutTabButton />
      </div>
      <FileView
        key={`${path}:${line ?? ""}`}
        projectId={projectId}
        repoPath={repoPath}
        path={path}
        line={line}
        git={git}
        onSaved={() => void git.refresh()}
        onDirtyChange={panelKey && tabKey ? (dirty) => setFileTabDirty(panelKey, tabKey, dirty) : undefined}
      />
      {codeMenu.element}
    </div>
  );
}

import "./SideFileView.css";
import { FileDiff, SquareArrowOutUpRight } from "lucide-react";
import { open } from "@/foundation/ui/navigation/open";
import { useChatFileLinks } from "@/features/chat/ui";
import { WorkplaceProvider } from "@/foundation/ui/workplace/workplaceContext";
import { FileView } from "./FileView";
import { fileTabPlace } from "./fileTabs";
import { useCodeQuoteMenu } from "./useCodeQuoteMenu";
import { useFilesGitStatus } from "./filesGit";
import { useProjects } from "@/features/projects/ui";
import { PopOutTabButton } from "@/features/panel/ui";

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
 * 上の帯に、コミットしていない変更があれば「差分を見る」（右の欄の変更のタブのそのファイルの位置へ）と、「ファイルタブで開く」（共通のチャットはファイルタブがないので出さない）。
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
  const { projectsById } = useProjects();
  const git = useFilesGitStatus({ projectId, worktree: worktree ?? null }, false);
  const links = useChatFileLinks();
  const changed = git.changeOf(path) !== null;
  const ref = { path, ...(line ? { line } : {}) };
  // 共通のチャットにはファイルタブがない（links.openInEditor が null）
  const openInEditor = links ? links.openInEditor : () => open({ kind: "file", projectId, ...ref, worktree });
  const repoPath = projectsById.get(projectId)?.repo_path ?? "";
  const codeMenu = useCodeQuoteMenu({ projectId, dir: worktree ?? (repoPath || undefined) });
  return (
    <div className="side-file" onContextMenu={codeMenu.onContextMenu}>
      <div className="side-file-bar bar">
        {changed && (
          <button type="button" className="btn" data-size="sm" title="このファイルのコミットしていない変更を、右の欄の「変更」で見ます" onClick={() => links?.openChanges(path)}>
            <FileDiff size={13} aria-hidden /> 差分を見る
          </button>
        )}
        <span className="spacer" />
        {openInEditor && (
          <button type="button" className="btn" data-size="sm" onClick={() => openInEditor(ref)}>
            <SquareArrowOutUpRight size={13} aria-hidden /> ファイルタブで開く
          </button>
        )}
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
        tab={tabOf && fileTabPlace(tabOf.panelKey, tabOf.tabKey)}
        inSide={codeMenu.inSide}
      />
      {codeMenu.element}
    </div>
  );
}

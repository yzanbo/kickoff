import { FolderOpen } from "lucide-react";
import type { Project } from "@shared/types";
import { changeProjectFolder } from "@/features/project/changeProjectFolder";

/**
 * 見出しのフォルダの場所。押すとフォルダを選び直す（changeProjectFolder）。
 * ブラウザから開いたとき（window.kickoff がない）は、フォルダを選べないので押せない
 */
export function ProjectFolderButton({ project }: { project: Project }) {
  const desktop = Boolean(window.kickoff);
  return (
    <button
      className="path-button"
      disabled={!desktop}
      title={desktop ? `プロジェクトフォルダ（${project.repo_path}）: 押すと変更` : project.repo_path}
      onClick={() => void changeProjectFolder(project)}
    >
      <FolderOpen size={13} aria-hidden />
      <span className="path-button-text">{project.repo_path}</span>
    </button>
  );
}

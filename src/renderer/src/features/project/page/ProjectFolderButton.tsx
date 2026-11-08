import { FolderOpen } from "lucide-react";
import type { Project } from "@shared/types";
import { changeProjectFolder } from "@/features/project/changeProjectFolder";
import { tipProps } from "@/ui/HoverTip";

/**
 * 見出しのフォルダの場所。押すとフォルダを選び直す（changeProjectFolder。選ぶ窓に「プロジェクトフォルダを変更します」とボタン「このフォルダに変更」を出す）。
 * ブラウザから開いたとき（window.kickoff がない）は、フォルダを選べないので押せない
 */
export function ProjectFolderButton({ project }: { project: Project }) {
  const desktop = Boolean(window.kickoff);
  return (
    <button
      className="path-button"
      disabled={!desktop}
      // 押すとフォルダを選び直すことを、乗せたときの説明の見出しで伝える（選ぶ窓にも「プロジェクトフォルダを変更します」と出す）
      {...tipProps(desktop ? `プロジェクトフォルダを変更…（いま: ${project.repo_path}）` : project.repo_path)}
      aria-label={desktop ? `プロジェクトフォルダを変更（いま: ${project.repo_path}）` : project.repo_path}
      onClick={() => void changeProjectFolder(project)}
    >
      <FolderOpen size={13} aria-hidden />
      <span className="path-button-text">{project.repo_path}</span>
    </button>
  );
}

import { FolderInput, FolderOpen } from "lucide-react";
import type { Project } from "@shared/types";
import { useContextMenu } from "@/ui/useContextMenu";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { changeProjectFolder } from "@/features/project/changeProjectFolder";

/**
 * 見出しのフォルダの場所。押すとメニュー（Finder で開く・フォルダを変更…）を開く（右クリックでも）。
 * ブラウザから開いたとき（window.kickoff がない）は、Finder もフォルダの選択も使えないので押せない
 */
export function ProjectFolderButton({ project }: { project: Project }) {
  const menu = useContextMenu();
  const desktop = Boolean(window.kickoff);
  return (
    <>
      <button
        className="path-button"
        disabled={!desktop}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        title={desktop ? `プロジェクトのフォルダ（${project.repo_path}）: Finder で開く・フォルダを変更` : project.repo_path}
        onClick={(e) => menu.toggle(e)}
        onContextMenu={(e) => menu.open(e)}
      >
        <FolderOpen size={13} aria-hidden />
        <span className="path-button-text">{project.repo_path}</span>
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="プロジェクトのフォルダ" ignore=".path-button" onClose={menu.close}>
          <MenuItem onSelect={() => void window.kickoff?.externalApps.openPath(project.repo_path)}>
            <FolderOpen size={14} aria-hidden /> Finder で開く
          </MenuItem>
          <MenuItem onSelect={() => void changeProjectFolder(project)}>
            <FolderInput size={14} aria-hidden /> フォルダを変更…
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}

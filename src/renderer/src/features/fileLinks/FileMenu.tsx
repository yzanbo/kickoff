import { AppWindow, Copy, ExternalLink, FolderSearch, PanelRight, SquareArrowOutUpRight } from "lucide-react";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import type { FileLinks } from "./fileLinkContext";
import type { FileRef } from "./fileRefs";

/**
 * チャットの中のファイルの右クリックのメニュー（返答のチップ・ターンの変更カードの行・ツールの行・右の欄の変更のファイルの見出しで共通）:
 * 開き方（右の欄・エディタタブ）/ 外のアプリ（VS Code・既定のアプリ・Finder で表示。Mac のアプリだけ）/ パスのコピー（作業場所からの相対・絶対）
 */
export function FileMenu({ at, file, links, onClose }: { at: Placement; file: FileRef; links: FileLinks; onClose: () => void }) {
  const absolute = `${links.index.root}/${file.path}`;
  const native = window.kickoff?.externalApps;
  return (
    <PopupMenu at={at} label={file.path} onClose={onClose}>
      <div className="menu-label">{file.path}</div>
      {links.side && (
        <MenuItem onSelect={() => links.open(file)}>
          <PanelRight size={14} /> 右の欄で開く
        </MenuItem>
      )}
      <MenuItem onSelect={() => links.openInEditor(file)}>
        <SquareArrowOutUpRight size={14} /> エディタタブで開く
      </MenuItem>
      {native && (
        <>
          <div className="menu-separator" role="separator" />
          <MenuItem onSelect={() => void native.openInVSCode(absolute, file.line)}>
            <ExternalLink size={14} /> VS Code で開く
          </MenuItem>
          <MenuItem onSelect={() => void native.openPath(absolute)}>
            <AppWindow size={14} /> 既定のアプリで開く
          </MenuItem>
          <MenuItem onSelect={() => void native.revealPath(absolute)}>
            <FolderSearch size={14} /> Finder で表示
          </MenuItem>
        </>
      )}
      <div className="menu-separator" role="separator" />
      <MenuItem onSelect={() => void navigator.clipboard.writeText(file.path)}>
        <Copy size={14} /> パスをコピー
      </MenuItem>
      <MenuItem onSelect={() => void navigator.clipboard.writeText(absolute)}>
        <Copy size={14} /> 絶対パスをコピー
      </MenuItem>
    </PopupMenu>
  );
}

import { PanelRight, SquareArrowOutUpRight } from "lucide-react";
import type { Placement } from "@/foundation/ui/lib/floating";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import type { ChatFileLinks } from "@/features/chat/ui";
import type { FileRef } from "./fileRefs";
import { PathMenuItems } from "@/features/files/ui/PathMenuItems";

/**
 * チャットの中のファイルの右クリックのメニュー（返答のチップ・ターンの変更カードの行・ツールの行・右の欄の変更のファイルの見出しで共通）:
 * 開き方（右の欄・ファイルタブ）/ 外のアプリとパスのコピー（土台の PathMenuItems。ファイルの木・検索の結果と同じ）
 */
export function FileMenu({ at, file, links, onClose }: { at: Placement; file: FileRef; links: ChatFileLinks; onClose: () => void }) {
  return (
    <PopupMenu at={at} label={file.path} onClose={onClose}>
      <div className="menu-label">{file.path}</div>
      {links.side && (
        <MenuItem onSelect={() => links.open(file)}>
          <PanelRight size={14} /> 右の欄で開く
        </MenuItem>
      )}
      {links.openInEditor && (
        <MenuItem onSelect={() => links.openInEditor?.(file)}>
          <SquareArrowOutUpRight size={14} /> ファイルタブで開く
        </MenuItem>
      )}
      <div className="menu-separator" role="separator" />
      <PathMenuItems root={links.root} paths={[file.path]} line={file.line} />
    </PopupMenu>
  );
}

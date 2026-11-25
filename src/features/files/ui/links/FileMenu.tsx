import { AppWindow, PanelRight, SquareArrowOutUpRight, type LucideIcon } from "lucide-react";
import type { Placement } from "@/foundation/ui/lib/floating";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import type { ChatFileLinks } from "@/features/chat/ui";
import type { FileRef } from "./fileRefs";
import type { FileLinkPlace } from "./linkPlace";
import { PathMenuItems } from "@/features/files/ui/PathMenuItems";

/** 開き方の項目の印と文言 */
const PLACE_ITEMS: Record<FileLinkPlace, { icon: LucideIcon; label: string }> = {
  side: { icon: PanelRight, label: "右の欄で開く" },
  window: { icon: AppWindow, label: "別ウィンドウで開く" },
  tab: { icon: SquareArrowOutUpRight, label: "ファイルタブで開く" },
};

/**
 * チャットの中のファイルの右クリックのメニュー（返答のチップ・ターンの変更カードの行・ツールの行・右の欄の変更のファイルの見出しで共通）:
 * 開き方（places = fileMenuPlaces。右の欄・別ウィンドウは押したときと同じ open、ファイルタブは openInEditor）/
 * 外のアプリとパスのコピー（土台の PathMenuItems。ファイルの木・検索の結果と同じ）
 */
export function FileMenu({ at, file, links, places, onClose }: { at: Placement; file: FileRef; links: ChatFileLinks; places: FileLinkPlace[]; onClose: () => void }) {
  const openAt = (place: FileLinkPlace) => (place === "tab" ? links.openInEditor?.(file) : links.open(file));
  return (
    <PopupMenu at={at} label={file.path} onClose={onClose}>
      <div className="menu-label">{file.path}</div>
      {places.map((place) => {
        const { icon: Icon, label } = PLACE_ITEMS[place];
        return (
          <MenuItem key={place} onSelect={() => openAt(place)}>
            <Icon size={14} /> {label}
          </MenuItem>
        );
      })}
      <div className="menu-separator" role="separator" />
      <PathMenuItems root={links.root} paths={[file.path]} line={file.line} />
    </PopupMenu>
  );
}

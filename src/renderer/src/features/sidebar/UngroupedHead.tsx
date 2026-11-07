import { SquarePen } from "lucide-react";
import { cx } from "@/lib/cx";
import { openNewChat } from "@/app/router";
import { IconButton } from "@/ui/IconButton";
import { FoldHead } from "@/ui/FoldHead";
import type { useGroupSections } from "./useGroupSections";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";
import { huedHeadProps } from "./bucketColor";

/**
 * サイドバーの「No Group」の見出し（グループがあるときだけ出す）。開閉・件数・グループなしで新しいチャット。
 * チャットをドロップするとグループから外す（drop は useGroupSections の ungroupedDrop）
 */
export function UngroupedHead({
  projectId,
  count,
  open,
  onToggle,
  drop,
  hue = null,
  onContextMenu,
}: {
  projectId: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  drop: ReturnType<typeof useGroupSections>["ungroupedDrop"];
  /** 見出しの色（「まとまりを色付きで表示」のとき。null なら付けない） */
  hue?: number | null;
  /** 右クリック（「まとまりを色付きで表示」のメニュー） */
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <FoldHead
      look="row"
      className={cx(drop.over && "drop-target", huedHeadProps(hue).className)}
      style={huedHeadProps(hue).style}
      onContextMenu={onContextMenu}
      {...drop.props}
      open={open}
      onToggle={onToggle}
      label={NO_GROUP_LABEL}
      count={count}
      actions={
        <>
          <IconButton icon={SquarePen} label={`${NO_GROUP_LABEL} で新しいチャット`} size={13} className="custom-group-add" onClick={() => openNewChat(projectId)} />
          {/* グループの見出しと＋の位置をそろえるため、右端の「…」の分を空けておく */}
          <span className="group-menu-spacer" aria-hidden />
        </>
      }
    />
  );
}

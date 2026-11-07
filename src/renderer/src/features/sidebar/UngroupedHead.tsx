import { SquarePen } from "lucide-react";
import { openNewChat } from "@/app/router";
import { IconButton } from "@/ui/IconButton";
import { FoldHead } from "@/ui/FoldHead";
import type { useGroupSections } from "./useGroupSections";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";
import { huedHeadProps } from "./bucketColor";

/**
 * サイドバーの「No Group」の見出し（グループがあるときだけ出す）。開閉・件数・グループなしで新しいチャット。
 * グループの見出しと同じく、ドラッグでグループの間へ並べ替える（dragProps は useGroupSections の ungrouped。
 * チャットを落とすとグループから外すドロップ先は、見出しと中身を包む要素に付ける）
 */
export function UngroupedHead({
  projectId,
  count,
  open,
  onToggle,
  dragProps,
  hue = null,
  onContextMenu,
}: {
  projectId: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  dragProps: ReturnType<typeof useGroupSections>["ungrouped"]["dragProps"];
  /** 見出しの色（「まとまりを色付きで表示」のとき。null なら付けない） */
  hue?: number | null;
  /** 右クリック（「まとまりを色付きで表示」のメニュー） */
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <FoldHead
      look="row"
      className={huedHeadProps(hue).className}
      style={huedHeadProps(hue).style}
      draggable
      title="ドラッグでグループの間へ並べ替える"
      onContextMenu={onContextMenu}
      {...dragProps}
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

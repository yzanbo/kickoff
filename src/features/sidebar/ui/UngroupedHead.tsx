import { SquarePen } from "lucide-react";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { FOLD_ROW, FoldHead } from "@/foundation/ui/kit/FoldHead";
import type { useGroupSections } from "./useGroupSections";
import { NO_GROUP_LABEL } from "@shared/groups/labels";
import { NewChatItem } from "@/features/chat/ui/open/NewChatItem";
import { huedHeadProps } from "./bucketColor";

/**
 * サイドバーの「No Group」の見出し（グループがあるときだけ出す）。開閉・件数・グループなしで新しいチャット（鉛筆と、右クリックのいちばん上）。
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
  /** 右クリック（「まとまりを色付きで表示」のメニュー。lead はその上に置く項目） */
  onContextMenu?: (e: React.MouseEvent, lead?: React.ReactNode) => void;
}) {
  return (
    <FoldHead
      look={FOLD_ROW}
      className={huedHeadProps(hue).className}
      style={huedHeadProps(hue).style}
      draggable
      title="ドラッグでグループの間へ並べ替える"
      onContextMenu={
        onContextMenu &&
        ((e) =>
          onContextMenu(
            e,
            // どこで始めるか（「No Group」と作業場所の札「本体」）を添える（チャットの右クリックと同じ NewChatItem）
            <NewChatItem place={{ projectId }} sameAs="" onSelect={() => openTarget({ kind: "newChat", projectId: projectId })} />,
          ))
      }
      {...dragProps}
      open={open}
      onToggle={onToggle}
      label={NO_GROUP_LABEL}
      count={count}
      actions={
        <>
          <IconButton icon={SquarePen} label={`${NO_GROUP_LABEL} で新しいチャット`} iconSize={13} className="custom-group-add" onClick={() => openTarget({ kind: "newChat", projectId: projectId })} />
          {/* グループの見出しと＋の位置をそろえるため、右端の「…」の分を空けておく */}
          <span className="group-menu-spacer" aria-hidden />
        </>
      }
    />
  );
}

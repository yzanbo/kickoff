import { Plus } from "lucide-react";
import { cx } from "@/lib/cx";
import { openNewChat } from "@/app/router";
import { IconButton } from "@/ui/IconButton";
import { FoldHead } from "@/ui/FoldHead";
import type { useGroupSections } from "./useGroupSections";

/**
 * サイドバーの「グループなし」の見出し（グループがあるときだけ出す）。開閉・件数・グループなしで新しいチャット。
 * チャットをドロップするとグループから外す（drop は useGroupSections の ungroupedDrop）
 */
export function UngroupedHead({
  projectId,
  count,
  open,
  onToggle,
  drop,
}: {
  projectId: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  drop: ReturnType<typeof useGroupSections>["ungroupedDrop"];
}) {
  return (
    <FoldHead
      look="row"
      className={cx(drop.over && "drop-target")}
      {...drop.props}
      open={open}
      onToggle={onToggle}
      label="グループなし"
      count={count}
      actions={
        <>
          <IconButton icon={Plus} label="グループなしで新しいチャット" size={13} className="custom-group-add" onClick={() => openNewChat(projectId)} />
          {/* グループの見出しと＋の位置をそろえるため、右端の「…」の分を空けておく */}
          <span className="group-menu-spacer" aria-hidden />
        </>
      }
    />
  );
}

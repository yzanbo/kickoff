import { Plus } from "lucide-react";
import { cx } from "@/lib/cx";
import { openNewChat } from "@/app/router";
import { IconButton } from "@/ui/IconButton";
import { GroupToggle } from "@/ui/GroupToggle";
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
    <div className={cx("custom-group-head ungrouped", drop.over && "drop-target")} {...drop.props}>
      <GroupToggle open={open} onToggle={onToggle} />
      <button className="custom-group-name ungrouped-name" onClick={onToggle}>
        グループなし
      </button>
      <span className="custom-group-count">{count}</span>
      <IconButton icon={Plus} label="グループなしで新しいチャット" size={13} className="custom-group-add" onClick={() => openNewChat(projectId)} />
      {/* グループの見出しと＋の位置をそろえるため、右端の「…」の分を空けておく */}
      <span className="group-menu-spacer" aria-hidden />
    </div>
  );
}

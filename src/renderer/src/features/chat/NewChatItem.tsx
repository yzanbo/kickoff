import { SquarePen } from "lucide-react";
import type { CSSProperties } from "react";
import { useGroup } from "@/stores/groups";
import { MenuItem } from "@/ui/PopupMenu";
import { useChatWorkplace } from "@/features/worktree/useWorkplace";
import { WORKPLACE_KIND_LABELS, WORKPLACE_SHORT_LABELS } from "@/features/worktree/workplace";
import { NO_GROUP_LABEL } from "./chatTitle";

/** 新しいチャットを始める先（グループ・作業場所のワークツリーのフォルダ。なければグループなし・本体） */
export interface NewChatPlace {
  projectId: number;
  group?: number;
  worktree?: string;
}

const hueStyle = (hue: number | null | undefined) => (hue === null || hue === undefined ? undefined : ({ "--group-hue": hue } as CSSProperties));

/**
 * 右クリックのメニューの「新しいチャット」（チャット・下書き・パネルのタブの右クリック、グループ・No Group・作業場所の見出しとタブのまとまりの札の右クリックで共通。いちばん上に置く）。
 * どのグループ・作業場所で始めるかが分かるよう、項目の右にグループの札と作業場所の札（「本体」「WT」。色はタブの札と同じ）を添える。
 * branch: 乗せたときの説明に出すブランチ（チャットが最後にいたブランチ。分からなければ作業場所から）。
 * sameAs: 乗せたときの説明の頭（チャットの右クリックは「このチャットと同じ」。見出しの右クリックは空にして、そのグループ・作業場所とだけ言う）
 */
export function NewChatItem({
  place,
  branch = null,
  sameAs = "このチャットと同じ",
  onSelect,
}: {
  place: NewChatPlace;
  branch?: string | null;
  sameAs?: string;
  onSelect: () => void;
}) {
  const group = useGroup(place.projectId, place.group);
  const workplace = useChatWorkplace({ project_id: place.projectId, worktree_path: place.worktree ?? null, branch });
  const groupName = group?.name ?? NO_GROUP_LABEL;
  const where = workplace.place.name ? WORKPLACE_SHORT_LABELS[workplace.place.kind] : null;
  const whereText = workplace.place.name ? `${WORKPLACE_KIND_LABELS[workplace.place.kind]}（${workplace.place.name}）` : WORKPLACE_KIND_LABELS.main;
  return (
    <MenuItem title={`${sameAs}グループ「${groupName}」・作業場所「${whereText}」で、新しいチャットを始める`} onSelect={onSelect}>
      <SquarePen size={14} /> 新しいチャット
      <span className="menu-place-badges" aria-hidden>
        <span className="menu-place-badge" style={hueStyle(group?.hue)}>
          {groupName}
        </span>
        {where && (
          <span className="menu-place-badge" style={hueStyle(workplace.hue)}>
            {where}
          </span>
        )}
      </span>
    </MenuItem>
  );
}

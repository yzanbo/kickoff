import { SquarePen } from "lucide-react";
import type { CSSProperties } from "react";
import { useGroup } from "@/features/groups/ui/stores/groups";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { useChatWorkplace } from "@/foundation/ui/workplace/useWorkplace";
import { WORKPLACE_KIND_LABELS, WORKPLACE_SHORT_LABELS } from "@/foundation/ui/workplace/workplace";
import { NO_GROUP_LABEL } from "@/features/chat/ui/chatTitle";
import type { NewChatPlace } from "@/features/chat/ui/screen/chatHost";


const hueStyle = (hue: number | null | undefined) => (hue === null || hue === undefined ? undefined : ({ "--hue": hue } as CSSProperties));

/** 新しいチャットを始める先の札と説明に使う値（グループの名前と色・作業場所の短い札と色・作業場所の説明） */
export function useNewChatPlace(place: NewChatPlace, branch: string | null = null) {
  const group = useGroup(place.projectId, place.group);
  const workplace = useChatWorkplace({ project_id: place.projectId, worktree_path: place.worktree ?? null, branch });
  const groupName = group?.name ?? NO_GROUP_LABEL;
  return {
    groupName,
    groupHue: group?.hue,
    where: workplace.place.name ? WORKPLACE_SHORT_LABELS[workplace.place.kind] : null,
    workplaceHue: workplace.hue,
    whereText: workplace.place.name ? `${WORKPLACE_KIND_LABELS[workplace.place.kind]}（${workplace.place.name}）` : WORKPLACE_KIND_LABELS.main,
  };
}

/** グループの札と作業場所の札（「本体」「WT」。色はタブの札と同じ）。右クリックのメニューの「新しいチャット」と、サイドバーの「新しいチャット」のボタンで共通 */
export function NewChatPlaceBadges({ place }: { place: ReturnType<typeof useNewChatPlace> }) {
  return (
    <span className="menu-place-badges" aria-hidden>
      <span className="menu-place-badge tag" style={hueStyle(place.groupHue)}>
        {place.groupName}
      </span>
      {place.where && (
        <span className="menu-place-badge tag" style={hueStyle(place.workplaceHue)}>
          {place.where}
        </span>
      )}
    </span>
  );
}

/**
 * 右クリックのメニューの「新しいチャット」（チャット・下書き・パネルのタブの右クリック、グループ・No Group・作業場所の見出しとタブのまとまりの札の右クリックで共通。いちばん上に置く）。
 * どのグループ・作業場所で始めるかが分かるよう、項目の右にグループの札と作業場所の札を添える。
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
  const info = useNewChatPlace(place, branch);
  return (
    <MenuItem title={`${sameAs}グループ「${info.groupName}」・作業場所「${info.whereText}」で、新しいチャットを始める`} onSelect={onSelect}>
      <SquarePen size={14} /> 新しいチャット
      <NewChatPlaceBadges place={info} />
    </MenuItem>
  );
}

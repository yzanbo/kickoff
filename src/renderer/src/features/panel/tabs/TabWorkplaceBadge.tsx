import type { CSSProperties } from "react";
import type { Chat } from "@shared/types";
import { useChatWorkplace } from "@/features/worktree/useWorkplace";
import { WORKPLACE_SHORT_LABELS } from "@/features/worktree/workplace";

/**
 * タブの名前の後ろに添える作業場所の札（グループ別にまとめたとき。グループはまとまりの頭に出るので、代わりにどの作業場所のチャットかを添える。利用者の依頼）。
 * 形はグループの札と同じ丸い札（.panel-tab-group-name）で、文はチャットの見出しの作業場所の札と同じ「本体 | main」「WT | ブランチ」、色は作業場所の色（workplaceHue）。
 * Git でない本体（ブランチがない）は出さない
 */
export function TabWorkplaceBadge({ chat }: { chat: Pick<Chat, "project_id" | "worktree_path" | "branch"> }) {
  const { place, hue } = useChatWorkplace(chat);
  if (!place.name) return null;
  return (
    <span className="panel-tab-group-name panel-tab-workplace" style={{ "--group-hue": hue } as CSSProperties} title={place.title}>
      {WORKPLACE_SHORT_LABELS[place.kind]} | {place.name}
    </span>
  );
}

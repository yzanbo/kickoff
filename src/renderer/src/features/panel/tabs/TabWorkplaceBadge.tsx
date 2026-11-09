import type { CSSProperties } from "react";
import type { Chat } from "@shared/types";
import { useChatWorkplace } from "@/features/worktree/useWorkplace";
import { WORKPLACE_SHORT_LABELS } from "@/features/worktree/workplace";

/**
 * タブの名前の後ろに添える作業場所の札（どの作業場所のチャットかを添える。利用者の依頼）。
 * 形はグループの札と同じ丸い札（.panel-tab-group-name）で、文は種類だけの「本体」「WT」（タブは幅が狭く、ブランチ名を添えると「本体 | …」と切れて読めないため。
 * ブランチ名は乗せたときの説明に出す。利用者の依頼）、色は作業場所の色（workplaceHue。同じブランチは同じ色）。
 * Git でない本体（ブランチがない）は出さない
 */
export function TabWorkplaceBadge({ chat }: { chat: Pick<Chat, "project_id" | "worktree_path" | "branch"> }) {
  const { place, hue } = useChatWorkplace(chat);
  if (!place.name) return null;
  return (
    <span className="panel-tab-group-name panel-tab-workplace" style={{ "--group-hue": hue } as CSSProperties} title={place.title}>
      {WORKPLACE_SHORT_LABELS[place.kind]}
    </span>
  );
}

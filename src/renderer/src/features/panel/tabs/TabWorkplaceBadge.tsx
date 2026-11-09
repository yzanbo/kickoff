import type { CSSProperties } from "react";
import type { Chat } from "@shared/types";
import { useChatWorkplace } from "@/features/worktree/useWorkplace";
import { WORKPLACE_SHORT_LABELS } from "@/features/worktree/workplace";

/**
 * タブの名前の後ろ（2 行のタブは下の行）に添える作業場所の札（どの作業場所のチャットかを添える。利用者の依頼）。
 * 形はグループの札と同じ丸い札（.panel-tab-group-name）で、文は「本体 | main」「WT | ブランチ」。タブの幅に入らないときは、ブランチ名を隠して種類だけの「本体」「WT」にする
 * （「本体 | …」と切れて読めなかったため。入るかは PanelTab が測り、.panel-tab.place-short でブランチ名を隠す。利用者の依頼）。
 * ブランチ名は乗せたときの説明にも出す。色は作業場所の色（workplaceHue。同じブランチは同じ色）。Git でない本体（ブランチがない）は出さない
 */
export function TabWorkplaceBadge({ chat }: { chat: Pick<Chat, "project_id" | "worktree_path" | "branch"> }) {
  const { place, hue } = useChatWorkplace(chat);
  if (!place.name) return null;
  return (
    <span className="panel-tab-group-name panel-tab-workplace" style={{ "--group-hue": hue } as CSSProperties} title={place.title}>
      {WORKPLACE_SHORT_LABELS[place.kind]}
      <span className="panel-tab-workplace-branch"> | {place.name}</span>
    </span>
  );
}

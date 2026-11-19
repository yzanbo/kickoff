import { useState } from "react";
import { Activity } from "lucide-react";
import type { Project } from "@shared/types";
import { useChatStates } from "@/features/chat/ui/state/chatStates";
import { openChatOrChild } from "@/features/chat/ui/open/openChat";
import { StateChatsPopover, chatsByState } from "@/features/chatList/ui/StateChatsPopover";
import { WaitingCountBadge } from "@/features/chatList/ui/activeChats/ActiveChatsButton";
import { useAllProjectChats, type WaitingBadge } from "@/features/chatList/ui/activeChats/useAllWaiting";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { usePopover } from "@/foundation/ui/kit/Popover";
import { Segmented } from "@/foundation/ui/kit/Segmented";

type Scope = "all" | "project";

/**
 * プロジェクトの見出しの右端のボタン: 押すと、左の状態ごとの数（StateStats）と同じ一覧（StateChatsPopover）を、すべてのプロジェクトのチャットで開く。
 * 一覧の上の切り替えで、このプロジェクトだけにもできる（開くたびに「すべてのプロジェクト」から）。
 * 右上にすべてのプロジェクトの要対応の数（useAllWaiting）。数えるプロジェクトは ⌘⇧A の「すべて」と同じ（useAllProjectChats）
 */
export function AllStateChats({ project, waiting }: { project: Pick<Project, "id" | "name">; waiting: WaitingBadge }) {
  const { pending } = useChatStates();
  const { anchor: popoverAnchor, ...popover } = usePopover<HTMLSpanElement>();
  const [scope, setScope] = useState<Scope>("all");
  const allChats = useAllProjectChats();
  const chats = scope === "all" ? allChats : allChats.filter((c) => c.project_id === project.id);
  const sections = popover.open ? chatsByState(chats, pending) : [];
  const note = waiting.count > 0 ? `（要対応 ${waiting.count} 件）` : "";
  const label = `すべてのプロジェクトの状態ごとのチャット${note}`;
  return (
    <span ref={popoverAnchor} className="active-chats-button">
      <IconButton
        icon={Activity}
        label={label}
        title={`${label}（作業中・回答待ち・未読。数はすべてのプロジェクトの回答待ち・未読）`}
        aria-haspopup="dialog"
        aria-expanded={popover.open}
        onClick={() => {
          // 開くたびに、すべてのプロジェクトから
          if (!popover.open) setScope("all");
          popover.toggle();
        }}
      />
      <WaitingCountBadge waiting={waiting} />
      {popover.open && (
        <StateChatsPopover
          title="状態ごとのチャット"
          anchor={popoverAnchor}
          sections={sections}
          showProject={scope === "all"}
          emptyText={scope === "all" ? "どのプロジェクトにも、作業中・回答待ち・未読のチャットはありません" : undefined}
          onOpen={openChatOrChild}
          onClose={popover.close}
          header={
            <Segmented
              className="segmented state-chats-scope"
              label="どのプロジェクトのチャットを出すか"
              value={scope}
              onChange={setScope}
              options={[
                { value: "all", label: "すべてのプロジェクト" },
                { value: "project", label: project.name, tip: `${project.name}（このプロジェクトだけ）` },
              ]}
            />
          }
        />
      )}
    </span>
  );
}

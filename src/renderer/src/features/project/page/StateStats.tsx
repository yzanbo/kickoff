import type { CSSProperties } from "react";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { openChat } from "@/app/router";
import { SECTION_LABELS, SECTION_TONES, StateChatsPopover, chatsByState } from "@/features/chatList/StateChatsPopover";
import { usePopover } from "@/ui/Popover";

/**
 * 画面の見出しの、状態ごとのチャット数（作業中・回答待ち・未読。0 のものは出さない）。
 * 数え方・並び・色はサイドバーのプロジェクトの数（HeadCounts）とカンバンの列にそろえる。
 * 押すと、状態ごとにまとめたチャットの一覧（StateChatsPopover）を開き、行を押すとそのチャットを開く。showProject なら行にプロジェクト名も出す（全プロジェクトの画面）
 */
export function StateStats({ chats, showProject = false }: { chats: Chat[]; showProject?: boolean }) {
  const { stateOf } = useChatStates();
  const popover = usePopover<HTMLDivElement>();

  const sections = chatsByState(chats, stateOf);
  if (sections.length === 0) return null;

  return (
    <div ref={popover.anchor} className="state-stats">
      <button type="button" className="state-stats-button" aria-expanded={popover.open} title="状態ごとのチャットを一覧する" onClick={popover.toggle}>
        {sections.map(({ column, chats: list }) => (
          <span key={column} className="stat stat-state" style={{ "--tone": SECTION_TONES[column] } as CSSProperties}>
            {SECTION_LABELS[column]} {list.length}
          </span>
        ))}
      </button>
      {popover.open && (
        <StateChatsPopover
          title="状態ごとのチャット"
          anchor={popover.anchor}
          sections={sections}
          showProject={showProject}
          onOpen={(chat) => openChat(chat.project_id, chat.id)}
          onClose={popover.close}
        />
      )}
    </div>
  );
}

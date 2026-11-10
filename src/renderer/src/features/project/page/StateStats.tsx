import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { openChatOrChild } from "@/features/chat/children/openChild";
import { StateChatsPopover, bucketTone, chatsByState } from "@/features/chatList/StateChatsPopover";
import { usePopover } from "@/ui/Popover";
import { BucketChip } from "@/features/chatList/StateChip";

/**
 * 画面の見出しの、状態ごとのチャット数（作業中・回答待ち・未読。0 のものは出さない）。
 * 数え方・並び・色はサイドバーのプロジェクトの数（HeadCounts）とカンバンの列にそろえ、見た目はボードの列の見出しと同じ札（ToneChip）にする。
 * 押すと、状態ごとにまとめたチャットの一覧（StateChatsPopover）を開き、行を押すとそのチャットを開く。showProject なら行にプロジェクト名も出す（全プロジェクトの画面）
 */
export function StateStats({ chats, showProject = false }: { chats: Chat[]; showProject?: boolean }) {
  const { pending } = useChatStates();
  const popover = usePopover<HTMLDivElement>();

  const sections = chatsByState(chats, pending);
  if (sections.length === 0) return null;

  return (
    <div ref={popover.anchor} className="state-stats">
      <button type="button" className="state-stats-button" aria-expanded={popover.open} title="状態ごとのチャットを一覧する" onClick={popover.toggle}>
        {sections.map((section) => (
          <BucketChip key={section.key} bucket={section} tone={bucketTone(section)} count={section.chats.length} chats={section.chats} />
        ))}
      </button>
      {popover.open && (
        <StateChatsPopover
          title="状態ごとのチャット"
          anchor={popover.anchor}
          sections={sections}
          showProject={showProject}
          // 子チャットも並ぶ（プロジェクト画面の見出し）ので、子チャットは設定の開き方で開く
          onOpen={openChatOrChild}
          onClose={popover.close}
        />
      )}
    </div>
  );
}

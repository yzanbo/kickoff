import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { NO_CHATS, openChat, useChatStates, useChatsWithChildrenByProject } from "@/features/chat/ui";
import { StateChatsPopover, bucketTone, chatsByState } from "./StateChatsPopover";
import { usePopover } from "@/foundation/ui/kit/Popover";
import { BucketChip } from "./StateChip";

/**
 * 画面の見出しの、状態ごとのチャット数（作業中・回答待ち・未読。0 のものは出さない）。
 * 数え方・並び・色はサイドバーのプロジェクトの数（HeadCounts）とカンバンの列にそろえ、見た目はボードの列の見出しと同じ札（ToneChip）にする。
 * 押すと、状態ごとにまとめたチャットの一覧（StateChatsPopover）を開き、行を押すとそのチャットを開く。showProject なら行にプロジェクト名も出す（全プロジェクトの画面）
 */
export function StateStats({ chats, showProject = false }: { chats: Chat[]; showProject?: boolean }) {
  const { pending } = useChatStates();
  const { anchor: popoverAnchor, ...popover } = usePopover<HTMLDivElement>();

  const sections = chatsByState(chats, pending);
  if (sections.length === 0) return null;

  return (
    <div ref={popoverAnchor} className="state-stats">
      <button type="button" className="state-stats-button" aria-expanded={popover.open} title="状態ごとのチャットを一覧する" onClick={popover.toggle}>
        {sections.map((section) => (
          <BucketChip key={section.key} bucket={section} tone={bucketTone(section)} count={section.chats.length} chats={section.chats} />
        ))}
      </button>
      {popover.open && (
        <StateChatsPopover
          title="状態ごとのチャット"
          anchor={popoverAnchor}
          sections={sections}
          showProject={showProject}
          // 子チャットも並ぶ（プロジェクト画面の見出し）ので、子チャットは設定の開き方で開く
          onOpen={(c) => openChat(c)}
          onClose={popover.close}
        />
      )}
    </div>
  );
}

/** プロジェクトの画面の見出しの、そのプロジェクトの状態ごとのチャット数（子チャットも数える。拡張点 projectHeaderStats） */
export function ProjectStateStats({ project }: { project: Pick<Project, "id"> }) {
  const counted = useChatsWithChildrenByProject()[project.id] ?? NO_CHATS;
  return <StateStats chats={counted} />;
}

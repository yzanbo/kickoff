import { Folder } from "lucide-react";
import type { ReactNode } from "react";
import type { Project, Chat } from "@shared/types";
import { useGroupName } from "@/stores/groups";
import { ProjectChip } from "@/features/project/ProjectChip";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";
import { useChatHeaderItems, useChatHeaderView } from "./ChatHeaderView";

/**
 * チャットの見出し: プロジェクト・作業場所・グループのバッジ、右に道具（検索・横幅。アーカイブはタブ・サイドバーの右クリックから）・ターン数と API 換算。
 * 名前・閉じる・状態の印（作業中・回答待ちなど）はパネルのタブにあるので、ここには出さない（名前はタブのダブルクリックで変える）。
 * どの項目を出すかは、右端の「見出しの表示」（見出しの何もないところの右クリックでも）で項目ごとに選ぶ（ChatHeaderView）
 */
export function ChatHeader({
  chat,
  project,
  tools,
}: {
  chat: Chat;
  project?: Project;
  /** 右の道具の列の先頭に置くもの（チャットの中の検索） */
  tools?: ReactNode;
}) {
  const groupName = useGroupName(chat.project_id, chat.group_id);
  const shows = useChatHeaderItems();
  const view = useChatHeaderView();
  const turns = shows("turns") && chat.num_turns > 0;
  const cost = shows("cost") && chat.cost_usd > 0;
  return (
    <header className="chat-header" onContextMenu={view.onContextMenu}>
      <div className="chat-title-row">
        {/* どのプロジェクト・作業場所のチャットか（サイドバーと同じ色のバッジ。押すとそのプロジェクトのカンバン） */}
        <span className="chat-sub muted small">
          {project && shows("project") && <ProjectChip id={project.id} name={project.name} linked />}
          {shows("worktree") && <WorktreeChip chat={chat} />}
          {groupName && shows("group") && (
            <span className="chat-group-chip" title={`グループ「${groupName}」のチャット`}>
              <Folder size={11} aria-hidden />
              {groupName}
            </span>
          )}
        </span>
        {chat.archived_at && <span className="archived-chip">アーカイブ済み</span>}
        <span className="spacer" />
        {/* 作業場所の道具（右に寄せ、名前・バッジと分ける。アプリの中のターミナルはパネルのタブの列のボタンから） */}
        <span className="chat-tools">
          {/* アーカイブのボタンは置かない（タブ・サイドバーの行の右クリックから、確かめてからアーカイブする） */}
          {tools}
        </span>
        {/* ターン数と費用（狭いときは隠す） */}
        {(turns || cost) && (
          <span className="chat-meta muted small">
            {turns && <span>{chat.num_turns} ターン</span>}
            {cost && <span title="サブスクリプション利用時も API 料金に換算した参考値">API 換算 ${chat.cost_usd.toFixed(2)}</span>}
          </span>
        )}
        {/* 見出しの表示（このボタン自体は隠せない） */}
        {view.button}
      </div>
      {view.menu}
    </header>
  );
}

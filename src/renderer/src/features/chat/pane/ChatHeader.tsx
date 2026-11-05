import { Folder } from "lucide-react";
import type { Project, Chat } from "@shared/types";
import { useGroupName } from "@/stores/groups";
import { PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { ProjectChip } from "@/features/project/ProjectChip";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";
import { ChatFind } from "@/features/chat/find/ChatFind";
import type { TimelineItem } from "@/features/chat/timeline/timelineItems";
import { ChatDisplayItems, useChatHeaderItems, useChatHeaderRowHidden } from "./ChatDisplayMenu";
import { ChatHeaderTools } from "./ChatHeaderTools";
import { useChatPaneState } from "./chatPaneContext";

/**
 * チャットの見出し: プロジェクト・作業場所・グループのバッジ、右に道具（会話 / 動き・検索など。アーカイブはタブ・サイドバーの右クリックから）・ターン数と API 換算。
 * 名前・閉じる・状態の印（作業中・回答待ちなど）はパネルのタブにあるので、ここには出さない（名前はタブのダブルクリックで変える）。
 * 行を出すか・どの項目を出すかは、タブの列の「表示」の「チャットの画面」（見出しの何もないところの右クリックでも同じもの）で選ぶ。
 * 行を隠していても、動きを見ている間（会話へ戻れるように）とアーカイブ済みのチャット（気づけるように）は出す。
 * 検索欄を見出しに出していないとき（行・項目を隠した）は、⌘F でチャットの右上に浮かせて出す（下の会話は動かさない）
 */
export function ChatHeader({
  chat,
  project,
  items,
  version,
}: {
  chat: Chat;
  project?: Project;
  /** 流れ全体（チャットの中の検索で探す） */
  items: TimelineItem[];
  /** 描いている項目（変わったら検索の印を付け直す） */
  version: unknown;
}) {
  const groupName = useGroupName(chat.project_id, chat.group_id);
  const shows = useChatHeaderItems();
  const rowHidden = useChatHeaderRowHidden();
  const showing = useChatPaneState((s) => s.showing) ?? "conversation";
  const menu = useContextMenu();
  const collapsed = rowHidden && showing === "conversation" && !chat.archived_at;
  // 検索は会話だけに効く。見出しに出さないときは、浮かせた欄を ⌘F・文が残っている間だけ出す
  const findInline = !collapsed && shows("find");
  const find = showing === "conversation" && <ChatFind items={items} version={version} floating={!findInline} />;
  if (collapsed) return <header className="chat-header collapsed">{find}</header>;

  const turns = shows("turns") && chat.num_turns > 0;
  const cost = shows("cost") && chat.cost_usd > 0;
  return (
    <header
      className="chat-header"
      // 何もないところの右クリックで「チャットの画面」のメニュー（ボタン・リンク・入力欄の上では、そのものの右クリックを残す）
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("button, a, input, textarea, [role='search']")) return;
        menu.open(e);
      }}
    >
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
        {/* 道具（右に寄せ、名前・バッジと分ける。アーカイブのボタンは置かない（タブ・サイドバーの行の右クリックから、確かめてからアーカイブする）） */}
        <span className="chat-tools">
          <ChatHeaderTools find={findInline ? find : null} />
        </span>
        {/* ターン数と費用（狭いときは隠す） */}
        {(turns || cost) && (
          <span className="chat-meta muted small">
            {turns && <span>{chat.num_turns} ターン</span>}
            {cost && <span title="サブスクリプション利用時も API 料金に換算した参考値">API 換算 ${chat.cost_usd.toFixed(2)}</span>}
          </span>
        )}
      </div>
      {!findInline && find}
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="チャットの画面" onClose={menu.close}>
          <ChatDisplayItems />
        </PopupMenu>
      )}
    </header>
  );
}

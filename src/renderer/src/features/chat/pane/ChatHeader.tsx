import { Fragment, type ReactNode } from "react";
import type { Project, Chat, ChatEvent } from "@shared/types";
import { GroupChip } from "@/features/group/GroupChip";
import { PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { ProjectChip } from "@/features/project/ProjectChip";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";
import { ProviderChip } from "@/features/chat/provider/ProviderChips";
import { GitHubLinkChip } from "@/features/github/GitHubLinkChip";
import { ChatFind } from "@/features/chat/find/ChatFind";
import { AgentPanelToggle } from "@/features/panel/agents/AgentPanelToggle";
import { cx } from "@/lib/cx";
import { ChatDisplayItems, useChatHeaderBadgeColors, useChatHeaderItems, useChatHeaderOrder, useChatHeaderRowHidden } from "./ChatDisplayMenu";
import { ChatHeaderTools } from "./ChatHeaderTools";
import { ChatHeaderTitle } from "./ChatHeaderTitle";
import { useChatPane, useChatPaneState } from "./chatPaneContext";

/**
 * チャットの見出し: プロジェクト・グループ・作業場所のバッジとチャットの名前（親のないチャットだけ。ダブルクリックで名前を変える）、右に道具（会話 / 動き・検索など。アーカイブはタブ・サイドバーの右クリックから）・ターン数と API 換算。
 * 右端に右の欄の開閉（右の欄を置ける画面だけ。子チャットの画面の中には右の欄を重ねないので出さない）。
 * 閉じる・状態の印（作業中・回答待ちなど）はパネルのタブにあるので、ここには出さない。
 * 子チャットは上の帯（ChildChatBar）に名前があり、メモのチャットはメモの欄の中なので、名前を出さない。
 * 行を出すか・どの項目を出すかは、タブの列の「表示」の「チャットの画面」（見出しの何もないところの右クリックでも同じもの）で選ぶ。
 * 行を隠していても、動きを見ている間（会話へ戻れるように）とアーカイブ済みのチャット（気づけるように）は出す。
 * 検索欄を見出しに出していないとき（行・項目を隠した）は、⌘F でチャットの右上に浮かせて出す（下の会話は動かさない）
 */
export function ChatHeader({
  chat,
  project,
  tail,
  version,
}: {
  chat: Chat;
  project?: Project;
  /** 記録の末尾（チャットの中の検索で探す。その前は検索がコアから読む） */
  tail: ChatEvent[];
  /** 描いている項目（変わったら検索の印を付け直す） */
  version: unknown;
}) {
  const shows = useChatHeaderItems();
  const ordered = useChatHeaderOrder();
  const { canOpenSide } = useChatPane();
  const rowHidden = useChatHeaderRowHidden();
  const badgeColors = useChatHeaderBadgeColors();
  const showing = useChatPaneState((s) => s.showing) ?? "conversation";
  const menu = useContextMenu();
  const collapsed = rowHidden && showing === "conversation" && !chat.archived_at;
  // 検索は会話だけに効く。見出しに出さないときは、浮かせた欄を ⌘F・文が残っている間だけ出す
  const findInline = !collapsed && shows("find");
  const find = showing === "conversation" && <ChatFind tail={tail} version={version} floating={!findInline} />;
  if (collapsed) return <header className="chat-header collapsed">{find}</header>;

  const turns = shows("turns") && chat.num_turns > 0;
  const cost = shows("cost") && chat.cost_usd > 0;
  const title = shows("title") && chat.parent_chat_id === null && chat.memo_path === null;
  // バッジ・数は、「見出しに出す項目」で並べ替えた順に出す
  const badges: Record<"project" | "group" | "worktree", ReactNode> = {
    project: project && shows("project") && <ProjectChip id={project.id} name={project.name} linked />,
    group: shows("group") && <GroupChip chat={chat} />,
    worktree: shows("worktree") && <WorktreeChip chat={chat} />,
  };
  const meta: Record<"turns" | "cost", ReactNode> = {
    turns: turns && <span>{chat.num_turns} ターン</span>,
    cost: cost && <span title="サブスクリプション利用時も API 料金に換算した参考値">API 換算 ${chat.cost_usd.toFixed(2)}</span>,
  };
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
        <span className={cx("chat-sub muted small", !badgeColors && "plain-badges")}>
          {ordered(["project", "group", "worktree"] as const).map((k) => (
            <Fragment key={k}>{badges[k]}</Fragment>
          ))}
          {/* チャットの AI（Claude Code をサブスクで使うふだんのチャットには出さない。メモの仕様書「0021」の Q1・Q13） */}
          <ProviderChip provider={chat.provider} />
          {/* 結び付いた GitHub の issue・PR（押すと GitHub タブでそれを開く） */}
          <GitHubLinkChip chat={chat} />
        </span>
        {title && <ChatHeaderTitle chat={chat} />}
        {chat.archived_at && <span className="archived-chip">アーカイブ済み</span>}
        <span className="spacer" />
        {/* 道具（右に寄せ、名前・バッジと分ける。アーカイブのボタンは置かない（タブ・サイドバーの行の右クリックから、確かめてからアーカイブする）） */}
        <span className="chat-tools">
          <ChatHeaderTools find={findInline ? find : null} />
        </span>
        {/* ターン数と費用（狭いときは隠す） */}
        {(turns || cost) && (
          <span className="chat-meta muted small">
            {ordered(["turns", "cost"] as const).map((k) => (
              <Fragment key={k}>{meta[k]}</Fragment>
            ))}
          </span>
        )}
        {canOpenSide && shows("agents") && <AgentPanelToggle chatId={chat.id} />}
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

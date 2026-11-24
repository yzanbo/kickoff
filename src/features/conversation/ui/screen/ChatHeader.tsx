import { Fragment, type ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { WorkplaceMoveChip } from "@/features/workplaceMove/ui";
import { ChatFind } from "@/features/conversation/ui/find/ChatFind";
import { useChatHeaderItems, useChatHeaderOrder, useChatHeaderRowHidden } from "@/features/conversation/ui/display/ChatDisplayMenu";
import { ChatHeaderFrame } from "./ChatHeaderFrame";
import { useChatDisplayMenu } from "@/features/conversation/ui/display/useChatDisplayMenu";
import { ChatHeaderTools } from "./ChatHeaderTools";
import { ChatHeaderTitle } from "./ChatHeaderTitle";
import { LinkedItemChip, useActivityNav, useChatScreen } from "@/features/chat/ui";
import { useCell } from "@/foundation/ui/store";
import { GroupChip } from "@/features/groups/ui";
import { ProjectChip } from "@/features/projects/ui";

/**
 * チャットの見出し: プロジェクト・グループ・作業場所のバッジとチャットの名前（親のないチャットだけ。ダブルクリックで名前を変える）、右に道具（会話 / 動き・検索など。アーカイブはタブ・サイドバーの右クリックから）・ターン数と API 換算。
 * 右端に右の欄の開閉（右の欄を置ける画面だけ。子チャットの画面の中には右の欄を重ねないので出さない）。
 * 閉じる・状態の印（作業中・回答待ちなど）はパネルのタブにあるので、ここには出さない。
 * 子チャットは上の帯（ChildChatBar）に名前があり、ノートのチャットはノートの欄の中なので、名前を出さない。
 * 行を出すか・どの項目を出すかは、タブの列の「表示」の「チャットの画面」（見出しの何もないところの右クリックでも同じもの）で選ぶ。
 * 行を隠していても、動きを見ている間（会話へ戻れるように）とアーカイブ済みのチャット（気づけるように）は出す。
 * 検索欄を見出しに出していないとき（行・項目を隠した）は、⌘F でチャットの右上に浮かせて出す（下の会話は動かさない）
 */
export function ChatHeader({
  chat,
  project,
}: {
  chat: Chat;
  project?: Project;
}) {
  const shows = useChatHeaderItems();
  const ordered = useChatHeaderOrder();
  // 右の欄の開閉ボタン（右の欄を置ける画面だけ）
  const SideToggle = useChatScreen().host.side?.Toggle;
  const rowHidden = useChatHeaderRowHidden();
  const showing = useCell(useActivityNav().showing);
  // 何もないところの右クリックで「チャットの画面」のメニュー（ボタン・リンク・入力欄の上では、そのものの右クリックを残す）
  const menu = useChatDisplayMenu();
  const collapsed = rowHidden && showing === "conversation" && !chat.archived_at;
  // 検索は会話だけに効く。見出しに出さないときは、浮かせた欄を ⌘F・文が残っている間だけ出す
  const findInline = !collapsed && shows("find");
  const find = showing === "conversation" && <ChatFind floating={!findInline} />;
  if (collapsed) return <header className="chat-header collapsed">{find}</header>;

  const turns = shows("turns") && chat.num_turns > 0;
  const cost = shows("cost") && chat.cost_usd > 0;
  const title = shows("title") && chat.parent_chat_id === null && chat.note_path === null;
  // バッジ・数は、「見出しに出す項目」で並べ替えた順に出す
  const badges: Record<"project" | "group" | "worktree", ReactNode> = {
    project: project && shows("project") && <ProjectChip id={project.id} name={project.name} linked />,
    group: shows("group") && <GroupChip chat={chat} />,
    worktree: shows("worktree") && <WorkplaceMoveChip chat={chat} />,
  };
  const meta: Record<"turns" | "cost", ReactNode> = {
    turns: turns && <span>{chat.num_turns} ターン</span>,
    cost: cost && <span title="サブスクリプション利用時も API 料金に換算した参考値">API 換算 ${chat.cost_usd.toFixed(2)}</span>,
  };
  return (
    <ChatHeaderFrame
      onContextMenu={menu.onBlank}
      // どのプロジェクト・作業場所のチャットか（サイドバーと同じ色のバッジ。押すとそのプロジェクトのカンバン）と、結び付いた GitHub の issue・PR（押すと GitHub タブでそれを開く）
      badges={
        <>
          {ordered(["project", "group", "worktree"] as const).map((k) => (
            <Fragment key={k}>{badges[k]}</Fragment>
          ))}
          <LinkedItemChip chat={chat} />
        </>
      }
      title={
        <>
          {title && <ChatHeaderTitle chat={chat} />}
          {chat.archived_at && <span className="archived-chip tag" data-look="outline">アーカイブ済み</span>}
        </>
      }
      // 道具（右に寄せ、名前・バッジと分ける。アーカイブのボタンは置かない（タブ・サイドバーの行の右クリックから、確かめてからアーカイブする））
      tools={<ChatHeaderTools find={findInline ? find : null} />}
      end={
        <>
          {/* ターン数と費用（狭いときは隠す） */}
          {(turns || cost) && (
            <span className="chat-meta muted small">
              {ordered(["turns", "cost"] as const).map((k) => (
                <Fragment key={k}>{meta[k]}</Fragment>
              ))}
            </span>
          )}
          {SideToggle && shows("agents") && <SideToggle chatId={chat.id} />}
        </>
      }
    >
      {!findInline && find}
      {menu.element}
    </ChatHeaderFrame>
  );
}

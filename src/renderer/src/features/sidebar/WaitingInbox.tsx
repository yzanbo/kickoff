import { Inbox } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { AGENT_STATE_LABELS, type Chat } from "@shared/types";
import { alertDialog } from "@/ui/dialogs";
import { FoldSection } from "@/ui/FoldHead";
import { useFold } from "@/hooks/useFold";
import { useContextMenu } from "@/ui/useContextMenu";
import { openChat, useRoute } from "@/app/router";
import { useChatStates } from "@/app/chatStatesContext";
import { ChatMenu } from "@/features/chat/ChatMenu";
import { STATE_TONE } from "@/features/chat/tones";
import { useChatRename } from "@/features/chat/useChatRename";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import { ChatRow } from "./ChatRow";
import { inboxSections, waitingSince, type InboxSection } from "./inboxOrder";

/**
 * 自分待ちのチャットを、プロジェクトをまたいで急ぐ順（回答待ち → エラー → 未読。見出しの中は待っている時間の長い順）に並べる。
 * variant: top = 一覧の上にまとめる（「自分待ち n 件」の見出しで開閉し、その下にプロジェクトの一覧が続く）/ list = 1 列にまとめる（これだけを並べる）。
 * 行はプロジェクトの一覧と同じ ChatRow（右クリック・名前の変更・複数選択）に、どのプロジェクトかの印を添える。
 * 出すのはサイドバーと同じく、しまっていない・タグの絞り込みに合うプロジェクトのチャット
 */
export function WaitingInbox({ chats, variant }: { chats: Record<number, Chat[]>; variant: "top" | "list" }) {
  const route = useRoute();
  const { stateOf, approvals } = useChatStates();
  const { visible } = useVisibleProjects();
  const sections = useMemo(
    () => inboxSections(visible.flatMap((p) => chats[p.id] ?? []), stateOf, (chat, state) => waitingSince(chat, state, approvals)),
    [visible, chats, stateOf, approvals],
  );
  const projectOf = useMemo(() => new Map(visible.map((p) => [p.id, p])), [visible]);
  const total = sections.reduce((n, s) => n + s.chats.length, 0);
  // 行の右クリックのメニューと、名前をその場で変える（プロジェクトの一覧の行と同じ）
  const rowMenu = useContextMenu<Chat>();
  const rename = useChatRename((m) => void alertDialog("名前を変更できませんでした", m));
  const topFold = useFold("sidebar", "waiting:top");

  const renderRow = (chat: Chat) => (
    <ChatRow
      key={chat.id}
      chat={chat}
      state={stateOf(chat)}
      active={route.name === "chat" && route.chatId === chat.id}
      menuOpen={rowMenu.menu?.value.id === chat.id}
      onMenu={(at) => rowMenu.openAt(at, chat)}
      onCloseMenu={rowMenu.close}
      onRename={() => rename.start(chat)}
      rename={rename.editorFor(chat)}
      project={projectOf.get(chat.project_id)}
    />
  );
  const body =
    total === 0 ? (
      <p className="chat-search-empty waiting-inbox-empty">自分待ちのチャットはありません</p>
    ) : (
      sections.map((section) => <InboxGroup key={section.state} section={section} renderRow={renderRow} />)
    );
  return (
    <div className={`waiting-inbox ${variant}`}>
      {variant === "top" ? (
        <FoldSection look="row" icon={Inbox} title="自分待ち（回答待ち・エラー・未読）" open={topFold.open} onToggle={topFold.toggle} label="自分待ち" count={total}>
          {body}
        </FoldSection>
      ) : (
        body
      )}
      {rowMenu.menu && (
        <ChatMenu
          at={rowMenu.menu.at}
          chat={rowMenu.menu.value}
          onOpenPanel={(chat) => openChat(chat.project_id, chat.id)}
          onRename={rename.start}
          onClose={rowMenu.close}
          onError={(m) => void alertDialog("操作できませんでした", m)}
          ignore=".chat-row-more"
        />
      )}
    </div>
  );
}

/** 急ぐ順の見出し 1 つ（状態の色の点・名前・件数。開閉は状態ごとに覚える） */
function InboxGroup({ section, renderRow }: { section: InboxSection; renderRow: (chat: Chat) => ReactNode }) {
  const fold = useFold("sidebar", `waiting:${section.state}`);
  const label = (
    <>
      <span className="status-group-dot" style={{ background: STATE_TONE[section.state] }} aria-hidden />
      <span className="status-group-label">{AGENT_STATE_LABELS[section.state]}</span>
    </>
  );
  return (
    <FoldSection look="section" open={fold.open} onToggle={fold.toggle} label={label} count={section.chats.length}>
      <ul className="chat-rows">{section.chats.map(renderRow)}</ul>
    </FoldSection>
  );
}

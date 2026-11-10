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
import { ProjectMark } from "@/features/project/ProjectMark";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import { openChildChat } from "@/features/chat/children/openChild";
import { useChatsWithChildrenByProject } from "@/stores/chats";
import { ChatRow } from "./ChatRow";
import { inboxByProject, inboxSections, waitingSince, type InboxSection } from "./inboxOrder";
import type { WaitingOrder } from "./waitingAxes";

/**
 * 要対応のチャットのまとまり。並べ方（order）は、状態順 = プロジェクトをまたいで回答待ち → エラー → 未読の見出しに分ける（見出しの中は待っている時間の長い順。
 * 行にどのプロジェクトかの印を添える）/ プロジェクト別 = サイドバーのプロジェクトの並びで見出しに分ける（見出しの中は状態順）。
 * variant: top = 一覧の上にまとめる（「要対応 n 件」の見出しで開閉し、その下にプロジェクトの一覧が続く）/ list = 要対応だけを並べる（これだけを並べる）。
 * 行はプロジェクトの一覧と同じ ChatRow（右クリック・名前の変更・複数選択）。出すのはサイドバーと同じく、しまっていない・タグの絞り込みに合うプロジェクトのチャット。
 * 子チャット（孫も）も並べ、押すと設定の開き方（右の欄 / 別ウィンドウ）で開く（利用者の依頼。前は親のないチャットだけで、未読の子チャットが数に入らなかった）
 */
export function WaitingInbox({ variant, order }: { variant: "top" | "list"; order: WaitingOrder }) {
  const chats = useChatsWithChildrenByProject();
  const route = useRoute();
  const { stateOf, approvals } = useChatStates();
  const { visible } = useVisibleProjects();
  // 並べ方ごとの見出し（状態順 = 状態の見出し / プロジェクト別 = プロジェクトの見出し。使わない方は空）
  const { sections, byProject } = useMemo(() => {
    const since = (chat: Chat, state: Parameters<typeof waitingSince>[1]) => waitingSince(chat, state, approvals);
    return order === "status"
      ? { sections: inboxSections(visible.flatMap((p) => chats[p.id] ?? []), stateOf, since), byProject: [] }
      : { sections: [], byProject: inboxByProject(visible, (id) => chats[id] ?? [], stateOf, since) };
  }, [order, visible, chats, stateOf, approvals]);
  const projectOf = useMemo(() => new Map(visible.map((p) => [p.id, p])), [visible]);
  const total = [...sections, ...byProject].reduce((n, s) => n + s.chats.length, 0);
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
      // 状態順はプロジェクトをまたぐので、どのプロジェクトかの印を添える（プロジェクト別は見出しで分かる）
      project={order === "status" ? projectOf.get(chat.project_id) : undefined}
      onOpen={chat.parent_chat_id !== null ? () => openChildChat(chat) : undefined}
      // 子チャットも親の外に 1 行で並ぶので、子チャットだと分かる札を付ける
      childMark
    />
  );
  const body =
    total === 0 ? (
      <p className="chat-search-empty waiting-inbox-empty">要対応のチャットはありません</p>
    ) : (
      <>
        {sections.map((section) => (
          <InboxGroup key={section.state} section={section} renderRow={renderRow} />
        ))}
        {byProject.map(({ project, chats: list }) => (
          <InboxProjectGroup key={project.id} project={project} chats={list} renderRow={renderRow} />
        ))}
      </>
    );
  return (
    <div className={`waiting-inbox ${variant}`}>
      {variant === "top" ? (
        <FoldSection look="row" icon={Inbox} title="要対応（回答待ち・エラー・未読）" open={topFold.open} onToggle={topFold.toggle} label="要対応" count={total}>
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

/** 状態順の見出し 1 つ（状態の色の点・名前・件数。開閉は状態ごとに覚える） */
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

/** プロジェクト別の見出し 1 つ（プロジェクトの印・名前・件数。開閉はプロジェクトごとに覚える） */
function InboxProjectGroup({ project, chats, renderRow }: { project: { id: number; name: string }; chats: Chat[]; renderRow: (chat: Chat) => ReactNode }) {
  const fold = useFold("sidebar", `waiting:project:${project.id}`);
  const label = (
    <>
      <ProjectMark project={project} />
      <span className="status-group-label">{project.name}</span>
    </>
  );
  return (
    <FoldSection look="section" open={fold.open} onToggle={fold.toggle} label={label} count={chats.length}>
      <ul className="chat-rows">{chats.map(renderRow)}</ul>
    </FoldSection>
  );
}

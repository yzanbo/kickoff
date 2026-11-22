import { useInsertionEffect, useRef, useState } from "react";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { useOpenChat } from "@/features/chat/ui/store/useChatStore";
import { useFileLinks } from "@/features/files/ui/links/useFileLinks";
import { SubagentScreen, windowSubagentNav } from "@/features/conversation/ui/screens/SubagentScreen";
import { popoutFileLinks, usePopoutFileLinks } from "@/features/files/ui/PopoutFiles";
import { ChatEnvironment, createRewindActions, useChatSending, useTimelineScrollHandle } from "@/features/conversation/ui";
/**
 * 別ウィンドウのサブエージェントの画面: チャットの中身をチャットの店から読み、右の欄と同じ SubagentScreen を描く
 * （メインエージェントの書いている途中の返答は出さないので、途中の文の口は読まない = 返答中に描き直さない）
 */
export function PopoutSubagent({ chatId, agentKey }: { chatId: number; agentKey: string }) {
  const { chat, project, error, ready } = useOpenChat(chatId, true);
  if (error) return <div className="page error">{error}</div>;
  if (!ready || !chat) return <div className="page muted">読み込み中…</div>;
  return <PopoutSubagentView key={chat.id} agentKey={agentKey} chat={chat} project={project} />;
}

/**
 * サブエージェントの画面だけを描く。メインの会話・右の欄が要る操作はこのウィンドウにないので、口はメインのウィンドウに頼むもの（windowSubagentNav）に差し替える。
 * 伝えた指示（自分の発言）の書き直し・送り直しは、チャットの画面と同じ選択と送り方で送る
 */
function PopoutSubagentView({ agentKey, chat, project }: { agentKey: string; chat: Chat; project?: Project }) {
  const scroll = useTimelineScrollHandle(true);
  const root = useRef<HTMLDivElement>(null);
  // 口はチャットごとに 1 回だけ作る
  const [nav] = useState(() => ({ ...windowSubagentNav(chat.id), rewind: createRewindActions(chat.id, () => scroll.follow()) }));
  const { options, send } = useChatSending(chat, scroll);
  useInsertionEffect(() => {
    nav.rewind.setSend({ options, sendOther: send.onSendOther });
  });
  const fileLinks = useFileLinks(chat, project?.repo_path, false);
  const links = usePopoutFileLinks(fileLinks, { chatId: chat.id, projectId: chat.project_id, worktree: chat.worktree_path ?? undefined });
  return (
    // チャットの画面と同じものを配る（作業場所を移す前の行は、そのときの作業場所の別ウィンドウで開く）
    <ChatEnvironment
      chat={chat}
      host={{ surface: "window", pausable: false, mainChatId: chat.id }}
      ports={{ root, subagents: nav.subagents, activity: nav.activity, composer: nav.composer }}
      timeline={null}
      rewind={nav.rewind.actions}
      links={links}
      side={false}
      adaptPast={(l, place) => popoutFileLinks(l, { chatId: chat.id, ...place })}
    >
      <div className="popout-body">
        <SubagentScreen chatId={chat.id} agentKey={agentKey} />
      </div>
    </ChatEnvironment>
  );
}

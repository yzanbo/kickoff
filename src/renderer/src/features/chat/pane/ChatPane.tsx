import { useEffect, useRef, useState } from "react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import { FileLinksProvider } from "@/features/fileLinks/FileLinksProvider";
import type { NewChatTarget } from "@/features/panel/tabs/panelTypes";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import { SelectionComment } from "@/features/chat/messages/SelectionComment";
import { ChatTimeline } from "@/features/chat/timeline/ChatTimeline";
import { ChatComposerArea } from "./ChatComposerArea";
import { ChatHeader } from "./ChatHeader";
import { ChatHeaderTools } from "./ChatHeaderTools";
import { ChatPaneContext } from "./chatPaneContext";
import { useWideText } from "./TextWidthToggle";
import { useChatDetail } from "./useChatDetail";
import { useChatView, type ChatViewInput } from "./useChatView";

interface ChatPaneProps {
  chatId: number;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** チャットを読み込んだとき・名前が変わったとき（パネルのタブの名前に使う） */
  onChatChange?: (chat: Chat) => void;
  /** パネルで表示しているか（裏のタブ・閉じたパネルでは false） */
  visible?: boolean;
  /** サブエージェントの中身を、パネルの新しいタブで開く */
  onOpenSubagent: (toolUseId: string, title: string) => void;
  /** 新しいチャットのタブを開く（送信待ちの指示を新しいチャットで聞くとき。パネルの外では渡さない） */
  onOpenNew?: (target: NewChatTarget, seed?: NewChatSeed) => void;
}

/** エージェントとのチャット（パネルのタブに出す）。中身を読み込み、読めたら ChatView を描く（チャットごとに作り直す） */
export function ChatPane({ chatId, focus, onChatChange, visible = true, onOpenSubagent, onOpenNew }: ChatPaneProps) {
  const { chat, project, events, approvals, live, streaming, error } = useChatDetail(chatId);

  // パネルのタブに、チャット（名前・状態・固定など）を知らせる（変わったらタブとその右クリックのメニューもすぐ変わる）
  const notifyChat = useRef(onChatChange);
  notifyChat.current = onChatChange;
  useEffect(() => {
    if (chat) notifyChat.current?.(chat);
  }, [chat]);

  if (error) return <div className="page error">{error}</div>;
  if (!chat) return <div className="page muted">読み込み中…</div>;
  return (
    <ChatView
      key={chat.id}
      chat={chat}
      project={project}
      events={events}
      approvals={approvals}
      live={live}
      streaming={streaming}
      focus={focus}
      visible={visible}
      onOpenSubagent={onOpenSubagent}
      onOpenNew={onOpenNew}
    />
  );
}

/**
 * 1 つのチャットの画面（見出し・流れ・チャット欄）。状態と操作は useChatView にあり、ここは描くだけ。
 * 子の部品への操作は ChatPaneContext 1 つで配る（流れの項目・ピル・送信待ち・検索など。値はチャットごとに 1 回だけ作る）
 */
function ChatView({ visible, ...input }: ChatViewInput & { visible: boolean }) {
  const { chat, project, events, approvals, streaming, focus } = input;
  const view = useChatView(input);
  const { pane } = view;
  // 文の幅を広げるか（見出しの行のボタン・設定の「表示」と同じ値）
  const [wide] = useWideText();
  // 一番下へ戻るボタンを置く、ピルの列の右端（描いたら要素が届き、流れの側で置けるか測る）
  const [pillDock, setPillDock] = useState<HTMLSpanElement | null>(null);
  return (
    <FileLinksProvider value={view.fileLinks}>
      <ChatPaneContext.Provider value={pane}>
        <div ref={pane.root} className={cx("chat-page chat-panel", wide && "wide")}>
          <ChatHeader chat={chat} project={project} tools={<ChatHeaderTools items={view.items} version={view.timeline.visible} />} />
          {/* 返答の一部を選んでコメントし、チャット欄に添える */}
          <SelectionComment />
          <ChatTimeline
            window={view.timeline}
            rel={view.rel}
            chat={chat}
            busy={view.busy}
            agents={view.subagents}
            live={view.live}
            streaming={streaming}
            approvals={approvals}
            focus={focus}
            scroll={view.scroll}
            events={events}
            prompts={view.prompts}
            visible={visible}
            pillDock={pillDock}
          />
          <ChatComposerArea
            chat={chat}
            events={events}
            prompts={view.prompts}
            live={view.live}
            busy={view.busy}
            options={view.options}
            subagents={view.subagents}
            send={view.send}
            composer={view.composer}
            onDock={setPillDock}
          />
        </div>
      </ChatPaneContext.Provider>
    </FileLinksProvider>
  );
}

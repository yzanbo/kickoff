import { memo, useState, type ReactNode } from "react";
import type { Chat, Project } from "@shared/types";
import { cx } from "@/lib/cx";
import type { NewChatTarget } from "@/features/panel/tabs/panelTypes";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import { SelectionAttach } from "@/features/chat/messages/SelectionAttach";
import { ChatTimeline } from "@/features/chat/timeline/ChatTimeline";
import { ActivityView } from "@/features/chat/activity/ActivityView";
import { SubagentsContext } from "@/features/chat/subagents/subagentsContext";
import { VisualsContext } from "@/features/chat/visuals/visualsContext";
import { BackgroundCallsContext } from "@/features/chat/tools/backgroundCalls";
import { useChatBackgroundCalls, useChatVisuals } from "@/features/chat/store/useChatStore";
import { noteForegroundProvider } from "@/features/chat/provider/chatProvider";
import { ChatComposerArea } from "./ChatComposerArea";
import { ChatHeader } from "./ChatHeader";
import { useChatPaneState } from "./chatPaneContext";
import { useWideText } from "./TextWidthToggle";
import { useChatView } from "./useChatView";
import type { ChatShellHandles } from "./useChatPaneActions";

interface ChatColumnProps {
  chat: Chat;
  project?: Project;
  focus?: number;
  /** 表示しているか（パネルの裏のタブ・閉じたパネルでは false） */
  visible: boolean;
  onOpenNew?: (target: NewChatTarget, seed?: NewChatSeed) => void;
  beforeSend?: () => Promise<void>;
  /** 殻（ChatView）が 1 回だけ作った操作・スクロール・チャット欄の口 */
  shell: ChatShellHandles;
}

/**
 * チャットの会話の欄（見出し・流れ・チャット欄）。殻（ChatView）の中の Activity の内側に置き、裏のタブでは止まる（effect を片付け、
 * 記録が届いても描き直さない。表に戻したら最新の記録で 1 回描く）。記録・回答待ち・作業中の様子・記録全体から作るものは、ここで
 * チャットの店の口を読む（殻は読まない。メモの仕様書「0023_表示を軽くする」の M5・分冊 3 の 3-3-1）。状態は useChatView にあり、ここは描くだけ。
 * 流れの部品が読むサブエージェント・図・裏の呼び出しは、ここから context で配る（右の欄のサブエージェントの画面は、同じ口を自分で読む）
 */
export const ChatColumn = memo(function ChatColumn({ chat, project, focus, visible, onOpenNew, beforeSend, shell }: ChatColumnProps) {
  const view = useChatView({ chat, project, focus, onOpenNew, beforeSend }, shell);
  const { pane: { root: paneRoot } } = shell;
  const { log, approvals } = view;
  // 会話の横幅を広げるか（見出しの行のボタン・設定の「表示」と同じ値）
  const [wide] = useWideText();
  // 一番下へ戻るボタンを置く、ピルの列の右端（描いたら要素が届き、流れの側で置けるか測る）
  const [pillDock, setPillDock] = useState<HTMLSpanElement | null>(null);
  // 裏でまだ動いている作業を起動した呼び出し（流れの中の裏のコマンドを、終わるまで実行中に見せる）
  const backgroundCalls = useChatBackgroundCalls(chat.id);
  // AI が描いた図（記録から組み立てる。流れの図の項目が読む）
  const visuals = useChatVisuals(chat.id);
  return (
    <SubagentsContext.Provider value={view.subagentsView}>
      <VisualsContext.Provider value={visuals}>
        <BackgroundCallsContext.Provider value={backgroundCalls}>
          {/* data-chat-id・data-chat-role: 右の欄・別ウィンドウで、選んだ所・右クリックした所のチャット（子チャット・メモのチャット）を見分ける */}
          <div
            ref={paneRoot}
            className={cx("chat-page chat-panel", wide && "wide")}
            data-chat-id={chat.id}
            data-chat-role={chat.memo_path ? "memo" : chat.parent_chat_id !== null ? "child" : "chat"}
            onPointerDownCapture={() => noteForegroundProvider(chat.provider)}
          >
            <ChatHeader chat={chat} project={project} tail={log.tail} />
            {/* 返答の一部を選んで、チャット欄に引用を足す（右の欄・別ウィンドウの中では SideSelectionAttach が出す） */}
            <SelectionAttach />
            <ChatBody
              activity={<ActivityView rel={view.rel} />}
              conversation={(shown) => (
                <ChatTimeline
                  window={view.timeline}
                  rel={view.rel}
                  chat={chat}
                  busy={view.busy}
                  agents={view.subagents}
                  live={view.live}
                  approvals={approvals}
                  focus={focus}
                  scroll={shell.scroll}
                  events={log.tail}
                  log={log}
                  prompts={view.prompts}
                  visible={visible && shown}
                  pillDock={pillDock}
                  hidden={!shown}
                />
              )}
            />
            <ChatComposerArea
              chat={chat}
              events={log.digest}
              prompts={view.prompts}
              live={view.live}
              busy={view.busy}
              options={view.options}
              subagents={view.subagents}
              send={view.send}
              composer={shell.composer}
              onDock={setPillDock}
            />
          </div>
        </BackgroundCallsContext.Provider>
      </VisualsContext.Provider>
    </SubagentsContext.Provider>
  );
});

/**
 * 会話（発言の流れ）と動き（メインとすべてのサブエージェントの動きを 1 本の時系列に）を、見出しの「会話 / 動き」で切り替えて出す。
 * 会話は隠しても描いたまま残す（読んでいた位置・開いたカード・窓の中の位置を保ち、動きの行から戻ってすぐ移れるように）
 */
function ChatBody({ conversation, activity }: { conversation: (shown: boolean) => ReactNode; activity: ReactNode }) {
  const showing = useChatPaneState((s) => s.showing) ?? "conversation";
  return (
    <>
      {conversation(showing === "conversation")}
      {showing === "activity" && activity}
    </>
  );
}

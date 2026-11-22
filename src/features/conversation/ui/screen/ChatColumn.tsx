import { memo, useState, type ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { cx } from "@/foundation/ui/lib/cx";
import { SelectionAttach } from "@/features/conversation/ui/messages/SelectionAttach";
import { ChatTimeline } from "@/features/conversation/ui/timeline/ChatTimeline";
import { ActivityView } from "@/features/conversation/ui/activity/ActivityView";
import { SubagentsContext } from "@/features/subagents/ui/subagentsContext";
import { VisualsContext } from "@/features/visuals/ui/visualsContext";
import { BackgroundCallsContext } from "@/features/conversation/ui/background/backgroundCalls";
import { chatVisuals } from "@/features/visuals/ui";
import { backgroundCalls } from "@/features/conversation/ui/background/selectors";
import { ProviderHandoffNotice } from "@/features/providerSwitch/ui/ProviderHandoffNotice";
import { ChatComposerArea } from "./ChatComposerArea";
import { ChatHeader } from "./ChatHeader";
import { chatRoleOf, useActivityNav } from "@/features/chat/ui";
import { useCell } from "@/foundation/ui/store";
import { useWideText } from "./TextWidthToggle";
import { useConversationState } from "./useConversationState";
import { useForegroundProvider } from "./useForegroundProvider";
import type { ChatShellHandles } from "./useChatShell";

interface ChatColumnProps {
  chat: Chat;
  project?: Project;
  focus?: number;
  /** 表示しているか（パネルの裏のタブ・閉じたパネルでは false） */
  visible: boolean;
  beforeSend?: () => Promise<void>;
  /** 殻（ChatShell）が 1 回だけ作った口・スクロール・チャット欄の口 */
  shell: ChatShellHandles;
}

/**
 * チャットの会話の欄（見出し・流れ・チャット欄）。殻（ChatView）の中の Activity の内側に置き、裏のタブでは止まる（effect を片付け、
 * 記録が届いても描き直さない。表に戻したら最新の記録で 1 回描く）。記録・回答待ち・作業中の様子・記録全体から作るものは、ここで
 * チャットの店の口を読む（殻は読まない）。状態は useConversationState にあり、ここは描くだけ。
 * 流れの部品が読むサブエージェント・図・裏の呼び出しは、ここから context で配る（右の欄のサブエージェントの画面は、同じ口を自分で読む）
 */
export const ChatColumn = memo(function ChatColumn({ chat, project, focus, visible, beforeSend, shell }: ChatColumnProps) {
  const view = useConversationState({ chat, project, focus, beforeSend }, shell);
  const { ports: { root: paneRoot } } = shell;
  // 押したら、このチャットの AI を下の帯の使用状況に出す（表に出たときは ChatScreen が出す）
  const noteForeground = useForegroundProvider(chat.provider, `chat:${chat.id}`);
  // 会話の横幅を広げるか（見出しの行のボタン・設定の「表示」と同じ値）
  const [wide] = useWideText();
  // 一番下へ戻るボタンを置く、ピルの列の右端（描いたら要素が届き、流れの側で置けるか測る）
  const [pillDock, setPillDock] = useState<HTMLSpanElement | null>(null);
  // 裏でまだ動いている作業を起動した呼び出し（流れの中の裏のコマンドを、終わるまで実行中に見せる）
  const backgroundCallIds = backgroundCalls.useFor(chat.id);
  // AI が描いた図（記録から組み立てる。流れの図の項目が読む）
  const visuals = chatVisuals.useFor(chat.id);
  return (
    <SubagentsContext.Provider value={view.subagentsView}>
      <VisualsContext.Provider value={visuals}>
        <BackgroundCallsContext.Provider value={backgroundCallIds}>
          {/* data-chat-id・data-chat-role: 右の欄・別ウィンドウで、選んだ所・右クリックした所のチャット（子チャット・ノートのチャット）を見分ける */}
          <div
            ref={paneRoot}
            className={cx("chat-page chat-panel", wide && "wide")}
            data-chat-id={chat.id}
            data-chat-role={chatRoleOf(chat)}
            onPointerDownCapture={noteForeground}
          >
            <ChatHeader chat={chat} project={project} />
            <ProviderHandoffNotice key={chat.id} chatId={chat.id} visible={visible} />
            {/* 返答の一部を選んで、チャット欄に引用を足す（右の欄・別ウィンドウの中では SideSelectionAttach が出す） */}
            <SelectionAttach />
            <ChatBody
              activity={<ActivityView rel={view.rel} />}
              conversation={(shown) => (
                <ChatTimeline
                  window={view.timeline}
                  rel={view.rel}
                  chat={chat}
                  focus={focus}
                  scroll={shell.scroll}
                  prompts={view.prompts}
                  visible={visible && shown}
                  pillDock={pillDock}
                  hidden={!shown}
                />
              )}
            />
            <ChatComposerArea
              chat={chat}
              prompts={view.prompts}
              live={view.live}
              options={view.options}
              send={view.send}
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
  const showing = useCell(useActivityNav().showing);
  return (
    <>
      {conversation(showing === "conversation")}
      {showing === "activity" && activity}
    </>
  );
}

// チャットのパネル・チャットの画面の右の欄のタブの中身（チャット・新しいチャット・子チャット・新しい子チャット・サブエージェント。種類の項目の Page は chatTabKinds.ts）。
// 中身からタブへの知らせは、どれも patchTab（その種類のタブの中身だけを変える）か、送った新しいチャットを置き換える replaceWithChat・replaceTab（新しい子チャット）
import { Activity } from "react";
import { api } from "@/foundation/ui/api";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { chatPaneSlot, createdChildPlace, openChat, useKeepAlive } from "@/features/chat/ui";
import { ChatScreen, NewChildPane, SideChildChat, SubagentScreen } from "@/features/conversation/ui";
import { childTab, useTabPage, type PanelTab, type TabPageProps } from "@/features/panel/ui";
import { NewChatPane } from "./tabs/NewChatPane";
import { openNewChat } from "./drafts/panelDrafts";
import { newChatDraft } from "@/features/composer/ui";
import { moveDraftSidePanel } from "./agents/draftSide";
import { sidePanelPort } from "./sidePanelPort";

/** 種類 K のタブの中身に渡すもの */
type PageOf<K extends PanelTab["kind"]> = TabPageProps<Extract<PanelTab, { kind: K }>>;

export function NewChatPage({ tab: t, panel, visible }: PageOf<"new">) {
  return (
    <NewChatPane
      draftKey={t.key}
      visible={visible}
      onCreated={(chat) => {
        // 固定していた下書きは、できたチャットも固定する（送るまでの間に固定を付け外ししていても、いまの値で）
        if (newChatDraft(t.key)?.pinned) void api.pinChat(chat.id, true).catch(reportFailure("ピン留めできませんでした"));
        // 下書きの右の欄（開いたノートなど）は、できたチャットの右の欄へ移す
        moveDraftSidePanel(t.key, chat.id);
        panel.replaceWithChat(t.key, chat);
      }}
    />
  );
}

// チャットの画面の右の欄（サブエージェントの欄）だけに開く。記録から作るものはチャットの店から読み、操作はそのチャットの画面のものを使う。
// 表示していない間は Activity で止める（伝える入力欄の音声入力など、チャットに止めない理由があれば止めない）
export const SubagentPage = ({ tab: t, visible }: PageOf<"subagent">) => <SubagentTabPage chatId={t.chatId} agentKey={t.agentKey} visible={visible} />;

// チャットの画面の右の欄だけに開く子チャット（孫・ひ孫も、いちばん上の親の右の欄）
export function ChildPage({ tab: t, panel, visible }: PageOf<"child">) {
  return (
    <SideChildChat
      chatId={t.childId}
      visible={visible}
      onTitle={(title) => panel.patchTab(t.key, { kind: "child", fields: { title } })}
      slot={chatPaneSlot(panel.key, t.key)}
    />
  );
}

// 新しい子チャット。最初の文を送ったら、できた子チャットのタブに置き換える（同じ位置のまま）。
// 「子チャットを作成」「新しい子チャットで聞く」から開いたタブ（follow）は、設定の「子チャットを作ったとき」が別ウィンドウ・開かないなら、閉じてそちらで開く
export function NewChildPage({ tab: t, panel }: PageOf<"newChild">) {
  return (
    <NewChildPane
      parentId={t.parentId ?? t.chatId}
      quote={t.quote}
      text={t.text}
      attachments={t.attachments}
      eventId={t.eventId}
      onCreated={(child, opts) => {
        const place = t.follow ? createdChildPlace(opts) : "side";
        if (place === "side") return panel.replaceTab(t.key, childTab({ chatId: t.chatId, childId: child.id, projectId: child.project_id, title: child.title }));
        panel.closeTab(t.key);
        if (place === "window") openChat(child, "window");
      }}
    />
  );
}

/** チャットのタブ: パネルのタブに置いたチャットの画面 */
export function ChatTabPage({ tab: t, panel, visible }: PageOf<"chat">) {
  const tabPage = useTabPage();
  return (
    <ChatScreen
      chatId={t.id}
      focus={t.focus}
      visible={visible}
      host={{
        surface: "tab",
        pausable: true,
        // チャットのタブの中にだけ右の欄を置く
        side: sidePanelPort,
        // 送信待ちの指示・選んだ文を新しいチャットで聞くときは、このパネルに新しいチャットのタブを開く
        openNewChat: (place, seed) => void openNewChat(panel.key, place, seed),
        // 隠れた画面で移る・動きを開くを受けたら、先にこのタブを表に出す
        bringToFront: tabPage?.show,
        slot: chatPaneSlot(panel.key, t.key),
        mainChatId: null,
      }}
      // 移したチャットは、移した先のプロジェクトのものとして扱う（projectId も合わせる）
      onChatChange={(chat) => panel.patchTab(t.key, { kind: "chat", fields: { title: chat.title, projectId: chat.project_id } })}
    />
  );
}

/** 右の欄のサブエージェントのタブ: 裏に回したら（外のチャットのタブが裏に回ったときも）止め、記録が届いても描き直さない */
function SubagentTabPage({ chatId, agentKey, visible }: { chatId: number; agentKey: string; visible: boolean }) {
  const keepAlive = useKeepAlive(chatId);
  return (
    <Activity mode={visible || keepAlive ? "visible" : "hidden"}>
      <SubagentScreen chatId={chatId} agentKey={agentKey} />
    </Activity>
  );
}

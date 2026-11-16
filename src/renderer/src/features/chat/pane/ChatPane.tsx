import { Activity, useEffect, useEffectEvent } from "react";
import type { Chat, Project } from "@shared/types";
import { FileLinksProvider } from "@/features/fileLinks/FileLinksProvider";
import { useFileLinks } from "@/features/fileLinks/useFileLinks";
import type { NewChatTarget } from "@/features/panel/tabs/panelTypes";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import { AgentSplit } from "@/features/panel/agents/AgentSplit";
import { usePanelHost } from "@/features/panel/panelHost";
import { clearKeepAlive, KeepAliveContext, useKeepAlive } from "@/features/panel/tabs/tabKeepAlive";
import { useTabPage } from "@/features/panel/tabs/tabPageContext";
import { useOpenChat } from "@/features/chat/store/useChatStore";
import { ChatProviderContext, noteForegroundProvider, useProviderStatus } from "@/features/chat/provider/chatProvider";
import { ChatColumn } from "./ChatColumn";
import { ChatPaneContext, useChatPaneSlot } from "./chatPaneContext";
import { useWindowMessagesFor } from "./windowMessages";
import { useChatPaneActions } from "./useChatPaneActions";

interface ChatPaneProps {
  chatId: number;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** チャットを読み込んだとき・名前が変わったとき（パネルのタブの名前に使う） */
  onChatChange?: (chat: Chat) => void;
  /** パネルで表示しているか（裏のタブ・閉じたパネルでは false） */
  visible?: boolean;
  /** 新しいチャットのタブを開く（送信待ちの指示・選んだ文を新しいチャットで聞くとき。パネルの外では渡さない） */
  onOpenNew?: (target: NewChatTarget, seed?: NewChatSeed) => void;
  /** パネルのタブの置き場所（chatPaneSlot。タブの右クリックから会話 / 動きを切り替える） */
  slot?: string;
}

/**
 * エージェントとのチャット（パネルのタブに出す）。チャットの店に見ることを頼み（読み込みと SSE は店で 1 回）、読めたら ChatView を描く
 * （チャットごとに作り直す）。読むのはチャット（名前・状態）だけで、記録が届いても描き直さない（会話の欄が自分で読む）
 */
export function ChatPane({ chatId, focus, onChatChange, visible = true, onOpenNew, slot }: ChatPaneProps) {
  const { chat, project, error } = useOpenChat(chatId, visible);

  // パネルのタブに、チャット（名前・状態・固定など）を知らせる（変わったらタブとその右クリックのメニューもすぐ変わる。会話の欄の外なので、裏のタブでも届く）
  const notifyChat = useEffectEvent((current: Chat) => onChatChange?.(current));
  useEffect(() => {
    if (chat) notifyChat(chat);
  }, [chat]);

  if (error) return <div className="page error">{error}</div>;
  if (!chat) return <div className="page muted">読み込み中…</div>;
  return <ChatView key={chat.id} chat={chat} project={project} focus={focus} visible={visible} onOpenNew={onOpenNew} slot={slot} pausable />;
}

/**
 * 会話の欄の見え方: 止めてよい画面（pausable。パネルのタブ・右の欄の子チャット）で、表示していなくて、止めない理由（keepAlive: 音声モード・録音・
 * アップロード・送信待ちと預かった指示の書き直し）がなければ hidden（React の Activity で止める）。メモのチャット・別ウィンドウはいつも visible
 */
export function useColumnMode(chatId: number, visible: boolean, pausable: boolean): "visible" | "hidden" {
  const keepAlive = useKeepAlive(chatId);
  return pausable && !visible && !keepAlive ? "hidden" : "visible";
}

interface ChatViewProps {
  chat: Chat;
  project?: Project;
  focus?: number;
  visible: boolean;
  slot?: string;
  onOpenNew?: (target: NewChatTarget, seed?: NewChatSeed) => void;
  /** 送る前にすること（メモのチャットで、書きかけのメモを保存してから送る） */
  beforeSend?: () => Promise<void>;
  /** 裏に回したら会話の欄を止めてよいか（パネルのタブ・右の欄の子チャット。メモのチャット・別ウィンドウは止めない） */
  pausable?: boolean;
}

/**
 * 1 つのチャットの画面の殻（メモの仕様書「0023_表示を軽くする」の M5・分冊 3 の 3-3-1 の ChatShell）: 子の部品への操作（ChatPaneContext。
 * チャットごとに 1 回だけ作る）・チャットの AI・ファイルのリンク・右の欄（AgentSplit）を持ち、会話の欄（ChatColumn）を React の Activity で包む。
 * 裏のタブでは会話の欄だけを止め、右の欄の中のファイル・メモ・DB などのタブ（エディタの元に戻すの履歴・選択）は止めない。
 * 殻は会話の欄を隠しても動き続けるので、タブの置き場所の登録（タブの右クリックの会話 / 動き）・別ウィンドウからの知らせ・店に見ることを頼むのはここ。
 * 読むのはチャット（名前・状態）だけで、記録・途中の文は読まない（読むと、隠れている間も記録が届くたびに殻ごと描き直す）
 */
export function ChatView({ chat, project, focus, visible, slot, onOpenNew, beforeSend, pausable = false }: ChatViewProps) {
  const canOpenSide = usePanelHost() !== null;
  const shell = useChatPaneActions({ chatId: chat.id, focus, canOpenSide, onOpenNew });
  const { pane } = shell;
  useChatPaneSlot(slot, pane);
  // 別ウィンドウ（変更・サブエージェント）からの知らせ（チャット欄に足す・会話のその場所へ移る・動きを開く）
  // （裏のタブ・閉じたパネルで移る・動きを開くを受けたら、先にこのタブを表に出す）
  useWindowMessagesFor(pane, useTabPage()?.show ?? null);
  // 返答の中のファイルのパス・変更カード・ツールの行のファイルを、押して右の欄（置けなければファイルタブ）で開けるようにする（作業場所のファイルだけ）
  const fileLinks = useFileLinks(chat, project?.repo_path, canOpenSide);
  // そのチャットの AI の状態（できること・ログインの仕方。中の部品は読み込みを頼まずに読むので、ここで 1 回頼む）
  useProviderStatus(chat.provider, { load: true });
  // 表に出したチャットの AI を、下の帯の使用状況に出す（触ったときも。分けたペインで隣のチャットへ移ったとき）
  useEffect(() => {
    if (visible) noteForegroundProvider(chat.provider);
  }, [visible, chat.provider]);
  const mode = useColumnMode(chat.id, visible, pausable);
  // 画面を閉じたら、止めない理由をすべて外す（片付けで外せない理由の持ち主が、会話の欄と一緒になくなるため。殻は Activity の外なので、閉じたときだけ流れる）
  useEffect(() => () => clearKeepAlive(chat.id), [chat.id]);
  return (
    <ChatProviderContext.Provider value={chat.provider}>
      <FileLinksProvider value={fileLinks}>
        <ChatPaneContext.Provider value={pane}>
          <KeepAliveContext.Provider value={chat.id}>
            <AgentSplit scope={chat.id} handleRef={shell.side}>
              <Activity mode={mode}>
                <ChatColumn chat={chat} project={project} focus={focus} visible={visible} onOpenNew={onOpenNew} beforeSend={beforeSend} shell={shell} />
              </Activity>
            </AgentSplit>
          </KeepAliveContext.Provider>
        </ChatPaneContext.Provider>
      </FileLinksProvider>
    </ChatProviderContext.Provider>
  );
}

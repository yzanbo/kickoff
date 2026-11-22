import { Activity, useEffect, useEffectEvent, type ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import {
  ActivityNavContext,
  chatRoleOf,
  ChatScreenContext,
  clearKeepAlive,
  KeepAliveContext,
  PastWorkplacesProvider,
  SubagentNavContext,
  TimelineNavContext,
  useKeepAlive,
  useOpenChat,
  useRegisterScreen,
  type ChatHost,
  type ChatScreenValue,
  type ScreenPorts,
  type TimelineNav,
} from "@/features/chat/ui";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { FileLinksProvider } from "@/features/files/ui/links/FileLinksProvider";
import { useFileLinks, type ChatFileLinks } from "@/features/files/ui/links/useFileLinks";
import { ChatImagesProvider } from "@/features/remoteImages/ui/ChatImage";
import { AgentSplit } from "@/features/chatPanel/ui/agents/AgentSplit";
import { usePanelHost } from "@/features/panel/ui/panelHost";
import { ChatProviderContext, useProviderStatus } from "@/features/ai/ui/provider/chatProvider";
import { useForegroundProvider } from "./useForegroundProvider";
import { RewindActionsContext, type RewindActions } from "@/features/conversation/ui/rewindContext";
import { ChatColumn } from "./ChatColumn";
import { useChatShell } from "./useChatShell";

interface ChatScreenProps {
  chatId: number;
  /** 置き場所ごとの違い（パネルのタブ・右の欄の子チャット・別ウィンドウ・ノートのチャット） */
  host: ChatHost;
  /** 表示しているか（裏のタブ・閉じたパネルでは false） */
  visible: boolean;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** チャットを読み込んだとき・名前が変わったとき（パネルのタブの名前に使う） */
  onChatChange?: (chat: Chat) => void;
  /** 画面のまわり（子チャットの上の帯など。読み込み中・失敗の行は包まない） */
  frame?: (chat: Chat, screen: ReactNode) => ReactNode;
}

/**
 * 1 つのチャットの画面（チャットの画面を描く所はどれもこれ 1 つ）。チャットの店に見ることを頼み（読み込みと SSE は店で 1 回）、
 * 読み込みの印が ready になったら殻（ChatShell）を描く（チャットごとに作り直す）。読むのはチャット（名前・状態）だけで、記録が届いても描き直さない
 */
export function ChatScreen({ chatId, host, visible, focus, onChatChange, frame }: ChatScreenProps) {
  const { chat, project, error, ready } = useOpenChat(chatId, visible);

  // パネルのタブに、チャット（名前・状態・固定など）を知らせる（変わったらタブとその右クリックのメニューもすぐ変わる。会話の欄の外なので、裏のタブでも届く）
  const notifyChat = useEffectEvent((current: Chat) => onChatChange?.(current));
  useEffect(() => {
    if (chat) notifyChat(chat);
  }, [chat]);

  if (error) return <div className="page error">{error}</div>;
  if (!ready || !chat) return <div className="page muted">読み込み中…</div>;
  const shell = <ChatShell key={chat.id} chat={chat} project={project} host={host} focus={focus} visible={visible} />;
  return frame ? frame(chat, shell) : shell;
}

/**
 * 会話の欄の見え方: 止めてよい画面（host.pausable）で、表示していなくて、止めない理由（keepAlive: 音声モード・録音・
 * アップロード・送信待ちと預かった指示の書き直し）がなければ hidden（React の Activity で止める）。ノートのチャット・別ウィンドウはいつも visible。
 * hidden にすると中の effect の片付けが、visible に戻すと effect が流れ直すので、流れ直して困るものは描いている間に決めるか店に置く
 */
function useColumnMode(chatId: number, visible: boolean, pausable: boolean): "visible" | "hidden" {
  const keepAlive = useKeepAlive(chatId);
  return pausable && !visible && !keepAlive ? "hidden" : "visible";
}

/**
 * 1 つのチャットの画面の殻: 子の部品への操作（チャットごとに 1 回だけ作る）と画面の値を ChatEnvironment で配り、右の欄（AgentSplit）を持ち、
 * 会話の欄（ChatColumn）を React の Activity で包む。裏のタブでは会話の欄だけを止め、右の欄の中のファイル・ノート・DB などのタブ（エディタの元に戻すの履歴・選択）は止めない。
 * 殻は会話の欄を隠しても動き続けるので、登録簿への登録（タブの右クリックの会話 / 動き・別ウィンドウからの知らせ・キーを受け取る画面）はここ。
 * 読むのはチャット（名前・状態）だけで、記録・途中の文は読まない（読むと、隠れている間も記録が届くたびに殻ごと描き直す）
 */
function ChatShell({ chat, project, host, focus, visible }: { chat: Chat; project?: Project; host: ChatHost; focus?: number; visible: boolean }) {
  const canOpenSide = usePanelHost() !== null;
  // ピルの列を画面の外に描いているとき（ノートのチャットの欄を閉じている）は、会話へ移る前に画面を見せる（置き場所の値は呼ぶときに読む）
  const hostRef = useLatest(host);
  const shell = useChatShell({ chatId: chat.id, focus, canOpenSide, beforeReveal: () => hostRef.current.chipsPortal?.reveal?.() });
  // 登録簿（タブの右クリックの会話 / 動き・別ウィンドウからの知らせ・最後に押した画面）。隠れた画面で移る・動きを開くを受けたら、先にこのタブを表に出す
  useRegisterScreen(chat.id, shell.ports, host.slot, host.bringToFront);
  // 返答の中のファイルのパス・変更カード・ツールの行のファイルを、押して右の欄（置けなければファイルタブ）で開けるようにする（作業場所のファイルだけ）
  const fileLinks = useFileLinks(chat, project?.repo_path, canOpenSide);
  // そのチャットの AI の状態（できること・ログインの仕方。中の部品は読み込みを頼まずに読むので、ここで 1 回頼む）
  useProviderStatus(chat.provider, { load: true });
  // 表に出したチャットの AI を、下の帯の使用状況に出す（触ったときも。分けたペインで隣のチャットへ移ったとき）
  useForegroundProvider(chat.provider, `chat:${chat.id}`, visible);
  const mode = useColumnMode(chat.id, visible, host.pausable);
  // 画面を閉じたら、止めない理由をすべて外す（片付けで外せない理由の持ち主が、会話の欄と一緒になくなるため。殻は Activity の外なので、閉じたときだけ流れる）
  useEffect(() => () => clearKeepAlive(chat.id), [chat.id]);
  return (
    <ChatEnvironment chat={chat} host={host} ports={shell.ports} timeline={shell.timeline} rewind={shell.rewind} links={fileLinks} side={canOpenSide}>
      <AgentSplit scope={chat.id} handleRef={shell.side}>
        <Activity mode={mode}>
          <ChatColumn chat={chat} project={project} focus={focus} visible={visible} beforeSend={host.beforeSend} shell={shell} />
        </Activity>
      </AgentSplit>
    </ChatEnvironment>
  );
}

interface ChatEnvironmentProps {
  chat: Chat;
  host: ChatHost;
  /** 画面の操作の口（チャットごとに 1 回だけ作ったもの。流れの口は timeline で渡す） */
  ports: Omit<ScreenPorts, "timeline">;
  /** 流れの中を移る口（流れのない別ウィンドウのサブエージェントの画面では null） */
  timeline: TimelineNav | null;
  /** 書き直し・再試行の口 */
  rewind: RewindActions | null;
  /** 返答の中のファイルのパスを押して開く口（作業場所のファイルだけ） */
  links: ChatFileLinks | undefined;
  /** 右の欄に開けるか（作業場所を移す前の行の開き方） */
  side: boolean;
  /** 作業場所を移す前の行の開き方を直す（別ウィンドウ） */
  adaptPast?: (links: ChatFileLinks, place: { projectId: number; worktree?: string }) => ChatFileLinks;
  children: ReactNode;
}

/**
 * チャットの画面の中で部品が読むもの（チャットの AI・ファイルのリンク・作業場所を移す前の行・外の画像・画面の値・操作・止めない理由の持ち主）を、
 * 1 か所でまとめて配る（チャットの画面 ChatScreen と、別ウィンドウのサブエージェントの画面が同じものを使う）
 */
export function ChatEnvironment({ chat, host, ports, timeline, rewind, links, side, adaptPast, children }: ChatEnvironmentProps) {
  const screen: ChatScreenValue = { chatId: chat.id, projectId: chat.project_id, role: chatRoleOf(chat), host, root: ports.root };
  return (
    <ChatProviderContext.Provider value={chat.provider}>
      <FileLinksProvider value={links}>
        <PastWorkplacesProvider chatId={chat.id} current={links} side={side} adapt={adaptPast}>
          <ChatImagesProvider chatId={chat.id}>
            <ChatScreenContext.Provider value={screen}>
              <TimelineNavContext.Provider value={timeline}>
                <SubagentNavContext.Provider value={ports.subagents}>
                  <ActivityNavContext.Provider value={ports.activity}>
                    <RewindActionsContext.Provider value={rewind}>
                      <KeepAliveContext.Provider value={chat.id}>{children}</KeepAliveContext.Provider>
                    </RewindActionsContext.Provider>
                  </ActivityNavContext.Provider>
                </SubagentNavContext.Provider>
              </TimelineNavContext.Provider>
            </ChatScreenContext.Provider>
          </ChatImagesProvider>
        </PastWorkplacesProvider>
      </FileLinksProvider>
    </ChatProviderContext.Provider>
  );
}

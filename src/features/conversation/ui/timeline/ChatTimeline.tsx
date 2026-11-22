import { useLayoutEffect } from "react";
import type { Approval } from "@shared/chat/approvalTypes";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { ChatLive } from "@shared/chat/chatLive";
import type { Chat } from "@shared/chat/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { useChatPane, useChatPaneState } from "@/features/chat/ui/screen/ports";
import type { ChatLogView } from "@/features/chat/ui";
import { chatLog, useStreamingActive } from "@/features/chat/ui/store/useChatStore";
import type { PromptList } from "@/features/conversation/ui/promptList/promptHistory";
import { StickyPrompt } from "@/features/conversation/ui/promptList/StickyPrompt";
import { useStickyPrompt } from "@/features/conversation/ui/promptList/useStickyPrompt";
import { useWorkingStatus } from "@/features/conversation/ui/working/useWorkingStatus";
import { keepSelectionOnClick, onEditable, onReplyBlank, QUOTABLE_ATTR } from "@/features/conversation/ui/messages/quotable";
import { useQuoteMenu } from "@/features/conversation/ui/messages/useMessageMenu";
import { ChatDisplayItems } from "@/features/conversation/ui/screen/ChatDisplayMenu";
import { observeSize } from "@/foundation/ui/hooks/useSizeObserver";
import { PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { ScrollBottomPill, useScrollPill } from "./ScrollBottomPill";
import { activeFloor, TimelineRows } from "./Timeline";
import { TimelineBusyContext } from "@/features/chat/ui/timeline/timelineBusy";
import { TimelineEnd } from "./TimelineEnd";
import type { TimelineScroll } from "./timelineScroll";
import { useFollowBottom } from "./useFollowBottom";
import { useMarkSeen } from "./useMarkSeen";
import { BOTTOM_SLACK_PX, useTimelineScroll } from "./useTimelineScroll";
import type { TimelineWindow } from "./useTimelineWindow";

/**
 * チャットの発言の流れ（発言とツールのまとまり・生成中の返答・確認のカード・作業中の行）。
 * 一番下を見ているときだけ、新しい発言に合わせてスクロールする（scroll の following。送ったら付いていくに戻る）。
 * 上にスクロールしている間は、一番下へ戻るボタンを出す（⌘↓ でも戻る）。答えを待っているとき・その間に作業が終わったときは、
 * ボタンに文を添えて目立たせ、下へ戻るよう誘う。
 * focus（検索結果から開いた発言）があれば、そこまでスクロールして一瞬強調する。
 * スクロールの決まりは useTimelineScroll、上に貼り付ける指示は useStickyPrompt、作業中の文は useWorkingStatus、流れの終わりは TimelineEnd
 */
export function ChatTimeline({
  window: w,
  rel,
  chat,
  busy,
  agents = [],
  live,
  approvals,
  focus,
  scroll,
  events,
  log,
  prompts,
  visible,
  pillDock,
  hidden,
}: {
  /** 流れの窓（描く行と箱・移る処理・読み足しの様子。useTimelineWindow） */
  window: TimelineWindow;
  rel: (s: string) => string;
  chat: Chat;
  busy: boolean;
  /** チャットのサブエージェント（実行中の数・長く動きのないもの・裏の作業の一覧から中身を開く） */
  agents?: SubagentEntry[];
  /**
   * 作業中の様子（裏の作業と、メインの返答が終わったか・通信の再試行中・つながるのを待っているところ・圧縮中・停止中）。
   * 停止中は押してからコアの知らせが届くまでの間も含め、圧縮中は作業中だけ（ChatView が決める）
   */
  live: ChatLive;
  approvals: Approval[];
  focus?: number;
  /** 流れのスクロールの持ち主（流れの要素と、一番下に付いていくか） */
  scroll: TimelineScroll;
  /** 会話の記録の末尾（最新の結果を一番下まで見たら既読にする） */
  events: ChatEvent[];
  /** 記録の口（前・後ろの記録を読んでいるか・途中の一部分を出しているか） */
  log: ChatLogView;
  /** 自分の指示の一覧（上に貼り付ける指示の帯の ↑ / ↓・添付） */
  prompts: PromptList;
  /** チャットを表示しているか（パネルの裏のタブ・閉じたパネルは見ていない） */
  visible: boolean;
  /** 一番下へ戻るボタンを置くピルの列の右端（入る幅があれば、流れに浮かせずそこに置く） */
  pillDock?: HTMLElement | null;
  /** 動きを見せている間は隠す（描いたまま残し、読んでいた位置・開いたカードを保つ） */
  hidden?: boolean;
}) {
  const pane = useChatPane();
  // 要素に付ける ref は先に取り出す（scroll.ref を JSX の ref に渡すと、React Compiler が scroll 全体を ref とみなして最適化から外す）
  const { ref: timelineRef, inner: timelineInnerRef } = scroll;
  // 書いている途中の返答があるか（文はチャットの店の口から StreamingReply が読む。書き始め・消したときだけ描き直す）
  const streaming = useStreamingActive(chat.id);
  const s = useTimelineScroll({ chatId: chat.id, scroll, root: pane.root, window: w, focus, focused: log.focused, backToTail: () => chatLog.backToTail(chat.id) });
  // 一番下に付いていく間は、流れの枠か中身の大きさが変わったら一番下へ寄せる（書いている途中の文・新しい項目・確認のカード・作業中の行も、すべて中身の大きさの知らせで）
  useFollowBottom(scroll, scroll.inner, s.settle);
  // 上に貼り付ける指示は、描く行が変わった・最後の項目が変わったときに確かめ直す
  const sticky = useStickyPrompt(scroll.ref, prompts, w.version, w.last?.key);
  // いまの作業の始まり（流れ全体で。これより後ろの行が作業中の行）
  const activeFrom = busy && !log.focused ? activeFloor(w.items) : w.items.length;
  // 流れの見えている高さを CSS の --timeline-h に入れる（サブエージェントのカードの窓を、その半分ほどの高さにする）
  useLayoutEffect(() => {
    const el = scroll.ref.current;
    if (!el) return;
    el.style.setProperty("--timeline-h", `${el.clientHeight}px`);
    return observeSize(el, ({ height }) => el.style.setProperty("--timeline-h", `${height}px`));
  }, [scroll]);
  // 作業中の行と一番下へ戻るボタンの文（1 回だけ組み立てる）
  const working = useWorkingStatus({ chat, events, last: w.last, streaming, live, agents, busy });
  const pill = useScrollPill({ away: s.away, waiting: approvals.length > 0, busy, chat, live, events, working });
  // 最新の結果を一番下まで見たら既読にする（新しい発言に合わせたスクロールの後で確かめる）
  // 途中の一部分を出している間は、流れの一番下が最新ではないので既読にしない
  useMarkSeen({ timelineRef: scroll.ref, chat, events, visible: visible && !log.focused, away: s.away, slackPx: BOTTOM_SLACK_PX });
  // 遠い記録を読むのが長引いているとき（押した所に回る印）
  const jumping = useChatPaneState((st) => st.jumping) ?? null;
  const pinned = sticky.pinned;
  // 流れの中の文（質問のカード・ツールの行・サブエージェントのカードなど）の右クリック。発言など自分のメニューを持つ所は、そちらが先に開く
  const quoteMenu = useQuoteMenu();
  // 何もないところ（発言・まとまりの外と、返答の行の文の外）の右クリックは、チャットの画面の表示のメニュー（タブの列・見出しの行など。隠したものをここから戻せる）
  const displayMenu = useContextMenu();

  return (
    <div className="timeline-wrap" hidden={hidden}>
      {/* 押すとピントが入り、↑↓・PageUp / PageDown・End でもスクロールできる（枠は出さない） */}
      <div
        className="timeline"
        ref={timelineRef}
        // 重いもの（図・コードの色付け）を手前で描き始める見張りの枠（hooks/useNearViewport）
        data-near-root=""
        tabIndex={-1}
        {...{ [QUOTABLE_ATTR]: "" }}
        onContextMenu={(e) => {
          if (quoteMenu.openInRegion(e) || e.defaultPrevented || onEditable(e.target)) return;
          if ((e.target as Element).closest("a, button, summary, input, textarea")) return;
          displayMenu.open(e);
        }}
        onContextMenuCapture={(e) => {
          // 返答の行の文の外（行の右の空き・段落の間）も何もないところと同じに扱い、返答のメニューより先に受ける
          if (!onReplyBlank(e, e.currentTarget)) return;
          e.stopPropagation();
          displayMenu.open(e);
        }}
        onClickCapture={keepSelectionOnClick}
        onScroll={(e) => {
          s.onScroll(e);
          sticky.update();
        }}
      >
        <div className="timeline-inner" ref={timelineInnerRef}>
          {/* 前の記録を読んでいる間だけ、上に 1 行（窓の外は箱なので、スクロールすれば描かれる。ボタンは置かない） */}
          {w.loadingEarlier && <TimelineLoading />}
          {/* 作業中かは項目の props で渡さず、書き直し・分岐のボタンだけが読む（timelineBusy） */}
          <TimelineBusyContext.Provider value={busy}>
            <TimelineRows window={w} rel={rel} activeFrom={activeFrom} />
          </TimelineBusyContext.Provider>
          {/* 途中の一部分を出しているときは、流れの終わりは最新ではないので、最新の分（書いている途中の返答・確認のカード・作業中の行）は出さない。
              下の端に近づくと後ろを読み、末尾とつながったら出す */}
          {log.focused ? (
            w.loadingLater && <TimelineLoading />
          ) : (
            <TimelineEnd chat={chat} busy={busy} streaming={streaming} visible={visible} approvals={approvals} working={working} live={live} agents={agents} events={events} />
          )}
        </div>
      </div>
      {pinned && (
        <StickyPrompt
          text={pinned.text}
          answers={pinned.answers}
          compactKind={pinned.compactKind}
          attachments={sticky.attachments}
          onPrev={sticky.hasPrev ? () => pane.stepPrompt(-1, pinned.id) : undefined}
          onNext={sticky.hasNext ? () => pane.stepPrompt(1, pinned.id) : undefined}
        />
      )}
      {/* 一番下へ戻るボタン: いまの状態を添えて出す（入る幅があればチャット欄の上のピルの列の右端に置く） */}
      {quoteMenu.element}
      {displayMenu.menu && (
        <PopupMenu at={displayMenu.menu.at} label="チャットの画面" onClose={displayMenu.close}>
          <ChatDisplayItems />
        </PopupMenu>
      )}
      {jumping !== null && (
        <div className="timeline-jumping pill" role="status">
          <span className="spinner" aria-hidden />
          読み込み中…
        </div>
      )}
      {s.away && <ScrollBottomPill tone={pill.tone} label={pill.label} dock={pillDock ?? null} onClick={s.scrollToBottom} />}
    </div>
  );
}

/** 前・後ろの記録を読んでいる間の 1 行（高さは決めた値。styles/chat/chat.css の .timeline-loading） */
function TimelineLoading() {
  return (
    <div className="timeline-loading" role="status">
      読み込み中…
    </div>
  );
}

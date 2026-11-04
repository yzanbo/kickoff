import type { Approval, Chat, ChatEvent, ChatLive } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";
import type { PromptList } from "@/features/chat/prompts/promptHistory";
import { StickyPrompt } from "@/features/chat/prompts/StickyPrompt";
import { useStickyPrompt } from "@/features/chat/prompts/useStickyPrompt";
import { useWorkingStatus } from "@/features/chat/status/useWorkingStatus";
import { ScrollBottomPill, useScrollPill } from "./ScrollBottomPill";
import { TimelineItems } from "./Timeline";
import { TimelineEnd } from "./TimelineEnd";
import type { TimelineScroll } from "./timelineScroll";
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
  streaming,
  approvals,
  focus,
  scroll,
  events,
  prompts,
  visible,
  pillDock,
}: {
  /** 描く範囲（長いチャットでは最近の項目だけ。窓の外の上・下の項目の数と、それを足す・最新に戻す操作） */
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
  /** 書いている途中の返答 */
  streaming: string;
  approvals: Approval[];
  focus?: number;
  /** 流れのスクロールの持ち主（流れの要素と、一番下に付いていくか） */
  scroll: TimelineScroll;
  /** 会話の記録（最新の結果を一番下まで見たら既読にする） */
  events: ChatEvent[];
  /** 自分の指示の一覧（上に貼り付ける指示の帯の ↑ / ↓・添付） */
  prompts: PromptList;
  /** チャットを表示しているか（パネルの裏のタブ・閉じたパネルは見ていない） */
  visible: boolean;
  /** 一番下へ戻るボタンを置くピルの列の右端（入る幅があれば、流れに浮かせずそこに置く） */
  pillDock?: HTMLElement | null;
}) {
  const pane = useChatPane();
  const s = useTimelineScroll({ scroll, root: pane.root, window: w, focus, approvalsCount: approvals.length, streaming });
  const sticky = useStickyPrompt(scroll.ref, prompts, s.firstKey, s.lastKey);
  // 作業中の行と一番下へ戻るボタンの文（1 回だけ組み立てる）
  const working = useWorkingStatus({ chat, events, last: w.last, streaming, live, agents, busy });
  const pill = useScrollPill({ away: s.away, waiting: approvals.length > 0, busy, chat, live, events, working });
  // 最新の結果を一番下まで見たら既読にする（新しい発言に合わせたスクロールの後で確かめる）
  useMarkSeen({ timelineRef: scroll.ref, chat, events, visible, away: s.away, slackPx: BOTTOM_SLACK_PX });
  const pinned = sticky.pinned;

  return (
    <div className="timeline-wrap">
      {/* 押すとピントが入り、↑↓・PageUp / PageDown・End でもスクロールできる（枠は出さない） */}
      <div
        className="timeline"
        ref={scroll.ref}
        tabIndex={-1}
        onScroll={(e) => {
          s.onScroll(e);
          sticky.update();
        }}
      >
        <div className="timeline-inner">
          {w.hidden > 0 && (
            <button type="button" className="link-button timeline-more" onClick={s.showMore}>
              以前の発言を表示（あと {w.hidden} 件）
            </button>
          )}
          <TimelineItems items={w.visible} rel={rel} active={busy} />
          {/* 途中の一部分を描いているときは、最新の分（書いている途中の返答・確認のカード・作業中の行）は出さない（一番下へ戻るボタンで最新へ） */}
          {w.hiddenAfter > 0 ? (
            <button type="button" className="link-button timeline-more" onClick={w.showLater}>
              以降の発言を表示（あと {w.hiddenAfter} 件）
            </button>
          ) : (
            <TimelineEnd chat={chat} busy={busy} streaming={streaming} approvals={approvals} working={working} live={live} agents={agents} />
          )}
        </div>
      </div>
      {pinned && (
        <StickyPrompt
          text={pinned.text}
          attachments={sticky.attachments}
          onPrev={sticky.hasPrev ? () => pane.stepPrompt(-1, pinned.id) : undefined}
          onNext={sticky.hasNext ? () => pane.stepPrompt(1, pinned.id) : undefined}
        />
      )}
      {/* 一番下へ戻るボタン: いまの状態を添えて出す（入る幅があればチャット欄の上のピルの列の右端に置く） */}
      {s.away && <ScrollBottomPill tone={pill.tone} label={pill.label} dock={pillDock ?? null} onClick={s.scrollToBottom} />}
    </div>
  );
}

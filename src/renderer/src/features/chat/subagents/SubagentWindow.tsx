import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { useFollowScroll } from "@/hooks/useFollowScroll";
import { useChatPaneState, useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";

/**
 * いちばん外側のサブエージェントのカードの、手順を入れる高さを決めた窓（流れの見えている高さの半分ほど。中だけスクロールする）。
 * 長いサブエージェントでもメインの会話が下へ押し流されないようにし、メインの配下の「窓」として見せる。
 * 実行中は最新（いちばん下）に付いていき、中で上へ戻したら止まる（ターミナルと同じ。いちばん下へ戻せばまた付いていく。useFollowScroll）。
 * 終わったものは初めから読めるよう、開いたときは上から。「全体を表示」で高さの制限を外す（チャットの画面の状態で覚える）
 */
export function SubagentWindow({ cardKey, running, children }: { cardKey: string; running: boolean; children: ReactNode }) {
  const pane = useOptionalChatPane();
  const full = useChatPaneState((s) => s.fullSubagents.has(cardKey)) ?? false;
  const { scrollRef, contentRef, overflowing, onScroll } = useFollowScroll(running, full);
  return (
    <div className={cx("subagent-window", full && "full")}>
      <div ref={scrollRef} className="subagent-window-scroll" onScroll={onScroll}>
        <div ref={contentRef} className="subagent-window-content">
          {children}
        </div>
      </div>
      {pane && (overflowing || full) && (
        <button
          type="button"
          className="link-button subagent-window-toggle"
          title={full ? "中身を、決めた高さの窓の中に戻します" : "高さの制限を外して、中身をすべて流れの中に出します"}
          onClick={() => pane.toggleSubagentFull(cardKey)}
        >
          {full ? "高さを戻す" : "全体を表示"}
        </button>
      )}
    </div>
  );
}

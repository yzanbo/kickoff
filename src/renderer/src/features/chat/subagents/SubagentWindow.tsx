import { useLayoutEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import { cx } from "@/lib/cx";
import { useChatPaneState, useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";

/** 最新（いちばん下）を見ているとみなす、窓の下端からの距離 */
const FOLLOW_SLACK_PX = 24;

/**
 * いちばん外側のサブエージェントのカードの、手順を入れる高さを決めた窓（流れの見えている高さの半分ほど。中だけスクロールする）。
 * 長いサブエージェントでもメインの会話が下へ押し流されないようにし、メインの配下の「窓」として見せる。
 * 実行中は最新（いちばん下）に付いていき、中で上へ戻したら止まる（ターミナルと同じ。いちばん下へ戻せばまた付いていく）。
 * 終わったものは初めから読めるよう、開いたときは上から。「全体を表示」で高さの制限を外す（チャットの画面の状態で覚える）
 */
export function SubagentWindow({ cardKey, running, children }: { cardKey: string; running: boolean; children: ReactNode }) {
  const pane = useOptionalChatPane();
  const full = useChatPaneState((s) => s.fullSubagents.has(cardKey)) ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const following = useRef(running);
  const [overflowing, setOverflowing] = useState(false);
  // 終わったら付いていくのをやめる（読み返している位置を動かさない）
  useLayoutEffect(() => {
    if (!running) following.current = false;
  }, [running]);
  // 中身が伸びたら（新しい手順・入れ子のカードを開いた・結果が届いた）、付いていく間はいちばん下へ。はみ出しているかも測り直す
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const update = () => {
      if (following.current && !full) scroller.scrollTop = scroller.scrollHeight;
      setOverflowing(scroller.scrollHeight > scroller.clientHeight + 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(content);
    return () => observer.disconnect();
  }, [full]);
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    following.current = running && el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX;
  };
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

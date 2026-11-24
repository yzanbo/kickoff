// ログの画面の付いていくスクロール: いちばん下にいる間は付いていく。上へ戻したら止めて流れを溜め、それまでに見た行を覚える（新しい行の数）
import { useLayoutEffect, useRef, useState } from "react";
import type { LogRow } from "./dockerLogView";

/** いちばん下を見ているとみなす、下端からの距離 */
const FOLLOW_SLACK_PX = 24;

/** bodyRef は流れの欄に付ける（付いていくスクロールと選んだ行のメニューが読む） */
export function useLogFollow(logs: { rows: LogRow[]; setHold: (hold: boolean) => void }, shown: LogRow[], layout: { wrap: boolean; showTime: boolean }) {
  const body = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [seen, setSeen] = useState({ id: 0, ts: "" });
  /** スクロールしたとき（下端に戻ったら付いていき、離れたら止める） */
  const onScroll = () => {
    const el = body.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX;
    if (bottom === following) return;
    setFollowing(bottom);
    logs.setHold(!bottom);
    if (!bottom) setSeen({ id: Math.max(0, ...logs.rows.map((r) => r.id)), ts: shown[shown.length - 1]?.ts ?? "" });
  };
  useLayoutEffect(() => {
    if (following && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [shown, following, layout.wrap, layout.showTime]);
  // 新しい行 = 止めたあとに届いた、止めたときの最後の行より新しい行（さかのぼって読んだ行は数えない）
  const newCount = following ? 0 : shown.filter((r) => r.id > seen.id && r.ts >= seen.ts).length;
  return {
    bodyRef: body,
    following,
    newCount,
    onScroll,
    /** 最新へ（付いていくのに戻す） */
    toLatest: () => {
      setFollowing(true);
      logs.setHold(false);
    },
    /** 付いていくのを止める（⌘F の一致へ移ったとき） */
    pause: () => {
      setFollowing(false);
      logs.setHold(true);
    },
  };
}

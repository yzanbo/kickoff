import "./ScrollBottomPill.css";
import { ArrowDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { ChatLive } from "@shared/chat/chatLive";
import type { Chat } from "@shared/chat/types";
import { cx } from "@/foundation/ui/lib/cx";
import { lastResultIdOf } from "@/features/conversation/ui/working/workingLabel";
import { CHAT_STATUS_LABELS, scrollPillOf, type ScrollPillTone } from "./scrollPill";
import { usePillDock } from "./usePillDock";

/**
 * 一番下へ戻るボタンに出すいまの状態（上を読んでいる間も、このチャットがどうなっているかが分かるように）。
 * 答えを待っている・上を読んでいる間に返答が届いた（失敗した）ときは目立たせて下へ誘い、作業中はいまの段階（working。作業中の行と同じ文）、
 * 終わっていれば結果を出す。通信が切れている（再試行中・つながるのを待っている）ときは黄にする
 */
export function useScrollPill({
  away,
  waiting,
  busy,
  chat,
  live,
  events,
  working,
}: {
  /** 一番下から離れているか */
  away: boolean;
  /** 答えを待っているか（確認のカードがある） */
  waiting: boolean;
  busy: boolean;
  chat: Chat;
  live: ChatLive;
  events: ChatEvent[];
  working: ReactNode | null;
}): { label: ReactNode; tone: ScrollPillTone } {
  // 上を読んでいる間に作業が終わったか（離れたときのいちばん新しい作業の終わりと比べる。一番下へ戻ったら消す）
  const lastResultId = lastResultIdOf(events);
  const [awayFromResult, setAwayFromResult] = useState<number | null>(null);
  const from = away ? (awayFromResult ?? lastResultId) : null;
  // 離れた・戻ったときだけ覚え直す（描いている間に合わせる）
  if (from !== awayFromResult) setAwayFromResult(from);
  const finishedWhileAway = away && from !== null && lastResultId > from;
  return scrollPillOf({
    waiting,
    reconnecting: Boolean(live.reconnect),
    finishedWhileAway,
    busy,
    retrying: Boolean(live.retry),
    failed: chat.status === "failed",
    working,
    statusLabel: CHAT_STATUS_LABELS[chat.status],
  });
}

/**
 * 一番下へ戻るボタン（上を読んでいる間だけ出す。いまの状態を添え、答えを待っている・返答が届いたときは目立たせて下へ誘う）。
 * 置き場所（ピルの列の右端か、流れの右下の隅）は usePillDock が決める
 */
export function ScrollBottomPill({
  tone,
  label,
  dock,
  onClick,
}: {
  tone: ScrollPillTone;
  label: ReactNode;
  /** ピルの列の右端の置き場所（ChatPane の .composer-chips-dock） */
  dock: HTMLElement | null;
  onClick: () => void;
}) {
  const { ref, place } = usePillDock(dock);
  return place(
    <button
      ref={ref}
      type="button"
      className={cx("scroll-bottom guide", tone, (tone === "waiting" || tone === "arrived") && "attention")}
      title="一番下までスクロール（⌘↓）"
      aria-label="一番下までスクロール"
      onClick={onClick}
    >
      {tone === "working" ? (
        <span className="dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      ) : (
        <ArrowDown size={14} aria-hidden />
      )}
      <span className="scroll-bottom-label">{label}</span>
      <kbd>⌘↓</kbd>
    </button>,
  );
}

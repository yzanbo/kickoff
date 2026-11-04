import { ArrowDown } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Chat, ChatEvent, ChatLive } from "@shared/types";
import { cx } from "@/lib/cx";
import { CHAT_STATUS_LABELS } from "@/features/chat/chatStatus";
import { lastResultIdOf } from "@/features/chat/status/workingLabel";

type ScrollPillTone = "waiting" | "arrived" | "working" | "idle" | "failed" | "offline";

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
  const awayFromResult = useRef<number | null>(null);
  if (!away) awayFromResult.current = null;
  else awayFromResult.current ??= lastResultId;
  const finishedWhileAway = away && awayFromResult.current !== null && lastResultId > awayFromResult.current;
  const failed = chat.status === "failed";
  if (waiting) return { label: "回答を待っています", tone: "waiting" };
  if (!busy && live.reconnect) return { label: "通信待ち（つながったら自動で再開）", tone: "offline" };
  if (finishedWhileAway) return { label: failed ? "失敗しました" : "返答が届きました", tone: failed ? "failed" : "arrived" };
  if (busy) return { label: working, tone: live.retry ? "offline" : "working" };
  return { label: CHAT_STATUS_LABELS[chat.status], tone: failed ? "failed" : "idle" };
}

/**
 * 一番下へ戻るボタン（上を読んでいる間だけ出す。いまの状態を添え、答えを待っている・返答が届いたときは目立たせて下へ誘う）。
 * チャット欄の上のピルの列に入る幅があれば、その右端に置いて 1 行にまとめる（dock。流れの最後の行に重ならない）。
 * ピルが 1 つもない・狭くて入らないときは、これまでどおり流れの右下の隅に浮かせる（列を 1 行増やすと流れの高さが変わり、画面が動くため）。
 * 入るかは、ピルの幅の合計とこのボタンの幅で決める（置き場所によらず同じ幅なので、置き直しても行き来しない）
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
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [docked, setDocked] = useState(false);
  useLayoutEffect(() => {
    const row = dock?.parentElement;
    if (!dock || !row || !button) {
      setDocked(false);
      return;
    }
    const chips = () => [...row.children].filter((c): c is HTMLElement => c !== dock && c instanceof HTMLElement);
    const check = () => {
      const others = chips();
      if (others.length === 0) return setDocked(false);
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const used = others.reduce((sum, c) => sum + c.getBoundingClientRect().width, 0) + gap * others.length;
      setDocked(used + button.getBoundingClientRect().width <= row.clientWidth);
    };
    // 列の幅・ピルの幅（数が変わる）・ボタンの幅（文が変わる）が変わったら測り直す。ピルが増えた・減ったら見張り直す
    const resize = new ResizeObserver(check);
    const watch = () => {
      resize.disconnect();
      for (const el of [row, button, ...chips()]) resize.observe(el);
      check();
    };
    const mutation = new MutationObserver(watch);
    mutation.observe(row, { childList: true });
    watch();
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [dock, button]);

  const pill = (
    <button
      ref={setButton}
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
    </button>
  );
  return docked && dock ? createPortal(pill, dock) : pill;
}

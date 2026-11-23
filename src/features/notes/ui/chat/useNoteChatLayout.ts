import { useRef, useState, type CSSProperties } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/notes/ui/storage";
import { useBottomChatMotion } from "./useBottomChatMotion";

/**
 * 開いたノートのチャットの欄の見え方: 開いているか（chatOpen）・閉じている間に下の入力欄も隠すか（quickHidden。ノートだけを広く見る）・置き場所（右 / 下）・
 * 大きさ（境目のつまみ。右なら幅 px（本文を 280px は残す）、下なら本文と欄を合わせた高さの %）・下に置いたときの開け閉めの動き（useBottomChatMotion）。
 * 欄を閉じている間は、ノートのチャットの上のピルの列と送信待ちを下の入力欄の上に描く（chipsPortal。送信待ちがあれば queued。下の入力欄から送るものも送信待ちに足す）。
 * body（本文と欄を並べる要素。ドラッグ中は --note-chat-w / -h を書き換える）・pane（欄の入れ物）・quickRef（下の入力欄の入れ物。高さを測る）は要素に付ける
 */
export function useNoteChatLayout() {
  const [chatOpen, setChatOpen] = useSetting(storage.settings.chatOpen);
  const [quickHidden, setQuickHidden] = useSetting(storage.settings.quickChatHidden);
  const [chipsHost, setChipsHost] = useState<HTMLDivElement | null>(null);
  const [queueHost, setQueueHost] = useState<HTMLDivElement | null>(null);
  const [queued, setQueued] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const width = useDragSize({ setting: storage.settings.chatWidth, edge: "start", min: 280, keep: 280, write: "--note-chat-w", pane, target: () => body.current });
  const [place, setPlace] = useSetting(storage.settings.chatPlace);
  const height = useDragSize({ setting: storage.settings.chatHeight, axis: "y", edge: "start", unit: "%", min: 20, max: 85, write: "--note-chat-h", pane, target: () => body.current });
  const size = place === "bottom" ? height : width;
  const { quickRef, ...motion } = useBottomChatMotion(chatOpen, place === "bottom");
  return {
    body,
    pane,
    quickRef,
    chatOpen,
    setChatOpen,
    quickHidden,
    setQuickHidden,
    /** 下の入力欄を畳んでいる（欄を開いている・隠している） */
    quickFolded: chatOpen || quickHidden,
    chipsPortal: chatOpen ? null : { target: chipsHost, queueTarget: queueHost, onQueued: setQueued, reveal: () => setChatOpen(true) },
    setChipsHost,
    setQueueHost,
    queued,
    place,
    setPlace,
    size,
    moved: motion.moved,
    /** 本文と欄を並べる要素のクラスと大きさの変数 */
    bodyClassName: cx(chatOpen && "chat-open", place === "bottom" && "chat-bottom", motion.moved && "chat-moved", size.resizing && "resizing"),
    bodyStyle: { "--note-chat-w": `${width.size}px`, "--note-chat-h": `${height.size}%`, "--note-chat-h-num": height.size, "--note-quick-h": `${quickHidden ? 0 : motion.quickHeight}px` } as CSSProperties,
    /** ⌘F の検索の欄は本文の右上に出す（右にノートのチャットを開いていれば、その欄の見出しを隠さないよう左へずらす） */
    findStyle: chatOpen && place !== "bottom" ? ({ "--note-find-right": `${width.size}px` } as CSSProperties) : undefined,
  };
}

export type NoteChatLayout = Omit<ReturnType<typeof useNoteChatLayout>, "body" | "pane" | "quickRef">;

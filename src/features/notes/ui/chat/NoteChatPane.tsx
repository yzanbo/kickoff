import type { MutableRefObject, RefObject } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { NoteChat, type NoteChatHandle } from "./NoteChat";
import { NoteQuickChat } from "./NoteQuickChat";
import type { NoteChatLayout } from "./useNoteChatLayout";

/** ノートのチャットの欄（本文の右か下）と、境目のつまみ。欄は閉じても描いたまま置き（書きかけの文も残る）、開け閉めは幅（下に置くときは高さ）をスライドさせる */
export function NoteChatPane({
  layout,
  paneRef,
  projectId,
  path,
  beforeSend,
  handleRef,
}: {
  layout: NoteChatLayout;
  paneRef: RefObject<HTMLDivElement | null>;
  projectId: number;
  path: string;
  beforeSend: () => Promise<void>;
  handleRef: MutableRefObject<NoteChatHandle | null>;
}) {
  const { chatOpen, place, size } = layout;
  return (
    <>
      {chatOpen && (
        <div
          className={place === "bottom" ? "pane-resizer-y" : "pane-resizer note-chat-resizer"}
          aria-label={place === "bottom" ? "ノートのチャットの欄の高さを変える" : "ノートのチャットの欄の幅を変える"}
          {...size.handle}
        />
      )}
      <div ref={paneRef} className={cx("note-chat-slot slide-pane", chatOpen && "open", size.resizing && "resizing")} data-size="outer" data-axis={place === "bottom" ? undefined : "x"} aria-hidden={!chatOpen} inert={!chatOpen}>
        <NoteChat
          projectId={projectId}
          path={path}
          visible={chatOpen}
          beforeSend={beforeSend}
          handleRef={handleRef}
          place={place}
          onPlaceChange={layout.setPlace}
          onHide={() => {
            layout.setQuickHidden(true);
            layout.setChatOpen(false);
          }}
          onQuickOnly={() => {
            layout.setQuickHidden(false);
            layout.setChatOpen(false);
          }}
          chipsPortal={layout.chipsPortal}
        />
      </div>
    </>
  );
}

/**
 * ノートのチャットの欄を閉じている間の、ページの下のこのノートを AI に直してもらう入力欄（会話は出さず、様子の 1 行だけ）。
 * 欄を開いても描いたまま置き、欄が開くのと同じ動きで高さを畳む（すぐ消すと、欄が開ききるまでの間、入力欄のあった所が空いて見えた）。
 * 欄を下に置くときは、すぐ入れ替えて、欄をこの入力欄の高さから伸ばす（useBottomChatMotion。quickRef で高さを測る）
 */
export function NoteQuickSlot({
  layout,
  quickRef,
  projectId,
  path,
  beforeSend,
}: {
  layout: NoteChatLayout;
  quickRef: (el: HTMLDivElement | null) => void;
  projectId: number;
  path: string;
  beforeSend: () => Promise<void>;
}) {
  const { quickFolded } = layout;
  return (
    <div className={cx("note-quick-slot", quickFolded && "folded", layout.place === "bottom" && "chat-bottom", layout.moved && "chat-moved")} aria-hidden={quickFolded} inert={quickFolded}>
      <div className="note-quick-clip">
        <div ref={quickRef}>
          <NoteQuickChat
            projectId={projectId}
            path={path}
            beforeSend={beforeSend}
            onOpenChat={() => layout.setChatOpen(true)}
            onHide={() => layout.setQuickHidden(true)}
            chipsRef={layout.setChipsHost}
            queueRef={layout.setQueueHost}
            queued={layout.queued}
          />
        </div>
      </div>
    </div>
  );
}

import { ChevronDown, MessageSquarePlus } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import type { AddTarget, ExtraControls, Picked } from "./SelectionAttach";

/**
 * 選んだ範囲の上の、足す先のボタン 1 つ（押すと onAdd に引用を渡して閉じる）。
 * target.more があれば横に ▾ を付けて「チャットに追加 ▾」の 1 つのボタンに見せ（「メモ ▾」と同じ形 `.selection-split`）、▾ でそのチャットに関わるほかの操作のメニューを開く。
 * メニューを開いている間は controls.hold(true)（外側のクリック・選び直しで消さない）
 */
export function SelectionTargetButton({ target, picked, controls }: { target: AddTarget; picked: Picked; controls: ExtraControls }) {
  const main = (
    <button
      type="button"
      className={target.more ? "btn selection-attach-button selection-split-main" : "btn selection-attach-button"}
      title={target.title}
      // 押してもピントが移って選択が消えないように
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        target.onAdd(picked.quote);
        controls.done();
      }}
    >
      <MessageSquarePlus size={13} aria-hidden />
      {target.label}
    </button>
  );
  if (!target.more) return main;
  return (
    <span className="selection-split">
      {main}
      <TargetMore label={target.label} items={() => target.more?.(picked, controls.done)} onHold={controls.hold} />
    </span>
  );
}

/** ▾ を押したときに、外側のクリックとして閉じないためのセレクタ（押すたびに開閉する） */
const MORE_SELECTOR = ".selection-chat-more";

/** 「チャットに追加」の横の ▾ とそのメニュー */
function TargetMore({ label, items, onHold }: { label: string; items: () => ReactNode; onHold: (hold: boolean) => void }) {
  const menu = useContextMenu<true>({ gap: 6 });
  useEffect(() => onHold(menu.isOpen), [menu.isOpen, onHold]);
  return (
    <>
      <button
        type="button"
        className="btn selection-attach-button selection-split-more selection-chat-more"
        aria-label={`${label}のほかの操作`}
        title="選択部分を使うチャットのほかの操作（子チャット・新しいチャットで聞く）"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => menu.toggle(e, true)}
      >
        <ChevronDown size={13} aria-hidden />
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={`${label}のほかの操作`} ignore={MORE_SELECTOR} onClose={menu.close}>
          {items()}
        </PopupMenu>
      )}
    </>
  );
}

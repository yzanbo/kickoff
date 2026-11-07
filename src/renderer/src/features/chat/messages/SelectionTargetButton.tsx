import { MessageSquarePlus } from "lucide-react";
import type { AddTarget, ExtraControls, Picked } from "./SelectionAttach";

/** 選んだ範囲の上の、足す先のボタン 1 つ（押すと onAdd に引用と選んだ範囲を渡して閉じる。アイコンは target.icon、なければ「チャットに追加」のもの） */
export function SelectionTargetButton({ target, picked, controls }: { target: AddTarget; picked: Picked; controls: ExtraControls }) {
  const Icon = target.icon ?? MessageSquarePlus;
  return (
    <button
      type="button"
      className="btn selection-attach-button"
      title={target.title}
      // 押してもピントが移って選択が消えないように
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        target.onAdd(picked.quote, picked);
        controls.done();
      }}
    >
      <Icon size={13} aria-hidden />
      {target.label}
    </button>
  );
}

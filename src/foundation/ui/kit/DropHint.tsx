import "./dragGhost.css";
import { createPortal } from "react-dom";
import { Ban } from "lucide-react";
import { createCell, useCell } from "@/foundation/ui/store";

/**
 * ドラッグ中に、落とせない理由をカーソルの横に出す札（作業中のチャットはほかのプロジェクトへ移せない、など）。
 * 落とせない落とし先の dragover で showDropHint を呼び続ける（dragover はカーソルを止めていても続けて届く）。
 * 呼ばれなくなって少したつと消えるので、落とし先から出た・落とした・やめたときに消す処理は要らない
 */
interface Hint {
  text: string;
  x: number;
  y: number;
}

const hint = createCell<Hint | null>(null, { equals: (a, b) => a === b || (a !== null && b !== null && a.text === b.text && a.x === b.x && a.y === b.y) });
let timer: ReturnType<typeof setTimeout> | undefined;

/** 落とせない理由を、カーソルの位置（clientX / clientY）の横に出す */
export function showDropHint(text: string, x: number, y: number) {
  hint.set({ text, x, y });
  clearTimeout(timer);
  timer = setTimeout(() => hint.set(null), 200);
}

/** 札を描く所（App に 1 つ置く） */
export function DropHintHost() {
  const current = useCell(hint);
  if (!current) return null;
  return createPortal(
    <div className="drop-blocked-hint" role="status" style={{ left: current.x + 14, top: current.y + 16 }}>
      <Ban size={12} aria-hidden /> {current.text}
    </div>,
    document.body,
  );
}

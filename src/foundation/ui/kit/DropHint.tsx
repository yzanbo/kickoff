import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Ban } from "lucide-react";

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

let hint: Hint | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** 落とせない理由を、カーソルの位置（clientX / clientY）の横に出す */
export function showDropHint(text: string, x: number, y: number) {
  if (hint?.text !== text || hint.x !== x || hint.y !== y) {
    hint = { text, x, y };
    emit();
  }
  clearTimeout(timer);
  timer = setTimeout(() => {
    hint = null;
    emit();
  }, 200);
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

/** 札を描く所（App に 1 つ置く） */
export function DropHintHost() {
  const current = useSyncExternalStore(subscribe, () => hint);
  if (!current) return null;
  return createPortal(
    <div className="drop-blocked-hint" role="status" style={{ left: current.x + 14, top: current.y + 16 }}>
      <Ban size={12} aria-hidden /> {current.text}
    </div>,
    document.body,
  );
}

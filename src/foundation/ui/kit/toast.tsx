import { createCell, useCell } from "@/foundation/ui/store";
import { CloseButton } from "./IconButton";
import { useOverlayOpen } from "./overlayCount";

/** 画面の下に少しの間だけ出す知らせ（「〇〇に追加しました［開く］」など。画面は移さない） */
interface Toast {
  id: number;
  message: string;
  /** 知らせの右のボタン（押すと知らせを閉じてから実行。その右にいつも閉じるボタンを出す） */
  action?: { label: string; run: () => void };
  /** 進行中（回る印を出す。時間では消さない） */
  busy?: boolean;
}

/** 出しておく時間 */
const TOAST_MS = 6000;

const toasts = createCell<Toast[]>([]);
let nextId = 1;

const dismiss = (id: number) => toasts.set((list) => list.filter((t) => t.id !== id));

/** 知らせを出す（同時に 3 つまで。古いものから消す） */
export function showToast(message: string, action?: Toast["action"]) {
  const id = nextId++;
  toasts.set((list) => [...list.slice(-2), { id, message, action }]);
  setTimeout(() => dismiss(id), TOAST_MS);
}

/** 進行中の知らせ（終わったら done で結果の文とボタンに、失敗したら fail で失敗の文に替える。替えたあとは少しの間だけ出す） */
export interface ProgressToast {
  done(message: string, action?: Toast["action"]): void;
  fail(message: string): void;
}

/** 進行中の知らせを出す（回る印つき。閉じるまで、または done / fail まで出したまま） */
export function showProgressToast(message: string): ProgressToast {
  const id = nextId++;
  toasts.set((list) => [...list.slice(-2), { id, message, busy: true }]);
  const finish = (next: Omit<Toast, "id">) => {
    toasts.set((list) => list.map((t) => (t.id === id ? { id, ...next } : t)));
    setTimeout(() => dismiss(id), TOAST_MS);
  };
  return { done: (text, action) => finish({ message: text, action }), fail: (text) => finish({ message: text }) };
}

/** 知らせの置き場所（App と別ウィンドウに 1 つずつ） */
export function ToastHost() {
  const list = useCell(toasts);
  useOverlayOpen(list.length > 0);
  if (list.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast floating">
          {t.busy && <span className="spinner small" aria-hidden />}
          <span className="toast-text">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="btn btn-sm toast-action"
              onClick={() => {
                dismiss(t.id);
                t.action?.run();
              }}
            >
              {t.action.label}
            </button>
          )}
          {/* 時間を待たずにすぐ消す */}
          <CloseButton label="知らせを閉じる" className="toast-close" onClick={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}

import { createCell, useCell } from "@/foundation/ui/store";
import { CloseButton } from "./IconButton";

/** 画面の下に少しの間だけ出す知らせ（「〇〇に追加しました［開く］」など。画面は移さない） */
interface Toast {
  id: number;
  message: string;
  /** 知らせの右のボタン（押すと知らせを閉じてから実行。その右にいつも閉じるボタンを出す） */
  action?: { label: string; run: () => void };
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

/** 知らせの置き場所（App と別ウィンドウに 1 つずつ） */
export function ToastHost() {
  const list = useCell(toasts);
  if (list.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
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

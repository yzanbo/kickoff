import { useEffect, useRef, useState } from "react";

/**
 * アプリ全体で使う確認・入力のダイアログ（OS 標準の confirm / prompt の代わり）。
 * - 見た目をアプリにそろえる（Electron では prompt が使えないため、名前の変更にも使う）
 * - ボタンは「キャンセル」と、操作の名前（「削除」など）。取り消せない操作は赤いボタン
 * - 最初はキャンセルを選んだ状態にし、Enter で誤って実行しないようにする（Esc・外側でも閉じる）
 */

interface ConfirmOptions {
  title: string;
  message?: string;
  /** 実行するボタンの名前（既定は「OK」。削除なら「削除」） */
  confirmLabel?: string;
  /** 取り消せない操作（赤いボタンにする） */
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  message?: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
}

type Request =
  | ({ kind: "confirm"; resolve: (ok: boolean) => void } & ConfirmOptions)
  | ({ kind: "prompt"; resolve: (value: string | null) => void } & PromptOptions);

let show: ((req: Request) => void) | undefined;

/** 確認のダイアログ。実行を選べば true */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.confirm([options.title, options.message].filter(Boolean).join("\n\n")));
    show({ kind: "confirm", resolve, ...options });
  });
}

/** 入力のダイアログ。決定すれば入力した文字（前後の空白は除く）、キャンセルなら null */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ kind: "prompt", resolve, ...options });
  });
}

/** App に 1 つだけ置く（ダイアログを表示する場所） */
export function DialogHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    show = (next) => {
      setValue(next.kind === "prompt" ? (next.initial ?? "") : "");
      setReq(next);
    };
    return () => {
      show = undefined;
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    ref.current?.showModal();
    // 入力ならその欄に、確認ならキャンセルにピントを置く（Enter で誤って実行しない）
    if (req.kind === "prompt") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      cancelRef.current?.focus();
    }
  }, [req]);

  const finish = (ok: boolean) => {
    if (!req) return;
    if (req.kind === "confirm") req.resolve(ok);
    else req.resolve(ok && value.trim() ? value.trim() : null);
    setReq(null);
    ref.current?.close();
  };

  if (!req) return null;
  const confirmLabel = req.confirmLabel ?? (req.kind === "prompt" ? "保存" : "OK");
  const danger = req.kind === "confirm" && req.danger;

  return (
    <dialog
      ref={ref}
      className="dialog app-dialog"
      onCancel={(e) => {
        e.preventDefault();
        finish(false);
      }}
      // 外側（背景）を押したら閉じる
      onClick={(e) => e.target === e.currentTarget && finish(false)}
    >
      <form
        className="app-dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          finish(true);
        }}
      >
        <h2 className="app-dialog-title">{req.title}</h2>
        {req.message && <p className="app-dialog-message">{req.message}</p>}
        {req.kind === "prompt" && (
          <label className="field">
            {req.label && <span className="field-label">{req.label}</span>}
            <input
              ref={inputRef}
              type="text"
              value={value}
              placeholder={req.placeholder}
              maxLength={200}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        )}
        <div className="app-dialog-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={() => finish(false)}>
            キャンセル
          </button>
          <button
            type={req.kind === "prompt" ? "submit" : "button"}
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            disabled={req.kind === "prompt" && !value.trim()}
            onClick={req.kind === "confirm" ? () => finish(true) : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

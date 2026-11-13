import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@shared/errors";
import { isSubmitKey } from "@/lib/keys";
import { DialogActions } from "./DialogActions";
import { CheckField } from "./Field";
import { PromptAssist, type PromptAssistOptions } from "./PromptAssist";

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
  /** キャンセルを出さない（お知らせ） */
  hideCancel?: boolean;
  /** 実行のときに一緒に選んでもらうチェック（あれば出す。confirmWithCheck） */
  check?: DialogCheck;
}

/** 確認のダイアログに添えるチェック（initial は初めの状態。help はチェックの状態ごとの説明） */
interface DialogCheck {
  label: string;
  initial?: boolean;
  help?: (checked: boolean) => string;
}

interface PromptOptions {
  title: string;
  message?: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** 入力欄の上に、文から入力の案を作ってもらう欄を添える（あればその文の欄にピントを置く） */
  assist?: PromptAssistOptions;
  /** 入力と一緒に選んでもらうチェック（あれば入力欄の下に出す。promptWithCheck） */
  check?: DialogCheck;
  /** 空のままでも決められる（空なら "" を返す。退避のメッセージなど、省ける入力） */
  optional?: boolean;
  /** 何行も書ける欄にする（書いた分だけ伸びる。Enter で決め、Shift+Enter で改行。AI への追加の指示など） */
  multiline?: boolean;
  /** 入力と一緒に 1 つ選んでもらう一覧（あれば入力欄の下に出す。promptWithSelect） */
  select?: DialogSelect;
}

/** 入力のダイアログに添える 1 つ選ぶ一覧（initial は初めに選んでおく value） */
interface DialogSelect {
  label: string;
  options: { value: string; label: string }[];
  initial: string;
}

interface ChoiceOptions {
  title: string;
  message?: string;
  /** キャンセルのほかに並べる選択肢（左から順に。primary はいちばんおすすめのもの、danger は取り消せない操作（赤）） */
  choices: { value: string; label: string; primary?: boolean; danger?: boolean }[];
  /** 「次からはこれにする」のチェックの文（あれば出す。選んだときにチェックしていたかを返す） */
  remember?: string;
}

type Request =
  | ({ kind: "confirm"; resolve: (ok: boolean, checked: boolean) => void } & ConfirmOptions)
  | ({ kind: "prompt"; resolve: (value: string | null, checked: boolean, selected: string) => void } & PromptOptions)
  | ({ kind: "choice"; resolve: (value: string | null, remember: boolean) => void } & ChoiceOptions);

let show: ((req: Request) => void) | undefined;

/** 確認のダイアログ。実行を選べば true */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.confirm([options.title, options.message].filter(Boolean).join("\n\n")));
    show({ kind: "confirm", resolve, ...options });
  });
}

/** チェックを 1 つ添えた確認のダイアログ（「git の管理を始める」など）。実行を選べばチェックの状態、キャンセルなら null */
export function confirmWithCheck(options: Omit<ConfirmOptions, "check" | "hideCancel"> & { check: DialogCheck }): Promise<{ checked: boolean } | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ kind: "confirm", resolve: (ok, checked) => resolve(ok ? { checked } : null), ...options });
  });
}

/** お知らせのダイアログ（エラーなど。ボタンは OK だけ） */
export function alertDialog(title: string, message?: string): Promise<void> {
  return confirmDialog({ title, message, hideCancel: true }).then(() => undefined);
}

/** 失敗をお知らせのダイアログで知らせる（操作の catch に渡す） */
export const reportFailure = (title: string) => (e: unknown) => alertDialog(title, errorMessage(e));

/** 入力のダイアログ。決定すれば入力した文字（前後の空白は除く）、キャンセルなら null */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ kind: "prompt", resolve, ...options });
  });
}

/** チェックを 1 つ添えた入力のダイアログ（「新しいブランチ」と「作ったらチェックアウトする」など）。決定すれば入力とチェックの状態、キャンセルなら null */
export function promptWithCheck(options: Omit<PromptOptions, "check"> & { check: DialogCheck }): Promise<{ value: string; checked: boolean } | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ kind: "prompt", resolve: (value, checked) => resolve(value === null ? null : { value, checked }), ...options });
  });
}

/** 一覧から 1 つ選んでもらう入力のダイアログ（「聞きたいこと」と「どのチャットで聞くか」など）。決定すれば入力と選んだ value、キャンセルなら null */
export function promptWithSelect(options: Omit<PromptOptions, "select"> & { select: DialogSelect }): Promise<{ value: string; selected: string } | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ kind: "prompt", resolve: (value, _checked, selected) => resolve(value === null ? null : { value, selected }), ...options });
  });
}

/** いくつかの選択肢から選ぶダイアログ（「このまま送る / 新しいワークツリーで始める」など）。選んだものの value、キャンセルなら null */
export function choiceDialog<T extends string>(options: Omit<ChoiceOptions, "choices"> & { choices: { value: T; label: string; primary?: boolean }[] }): Promise<T | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ kind: "choice", resolve: (value) => resolve(value as T | null), ...options });
  });
}

/** 3 つ以上から選ぶダイアログに「次からはこれにする」のチェックを添える（選んだものと、チェックしていたか。やめたら null） */
export function choiceDialogWithRemember<T extends string>(
  options: Omit<ChoiceOptions, "choices" | "remember"> & { choices: { value: T; label: string; primary?: boolean; danger?: boolean }[]; remember: string },
): Promise<{ value: T; remember: boolean } | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ kind: "choice", resolve: (value, remember) => resolve(value === null ? null : { value: value as T, remember }), ...options });
  });
}

/** App に 1 つだけ置く（ダイアログを表示する場所） */
export function DialogHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  // 「次からはこれにする」のチェック（確認に添えるチェックも、これで持つ）
  const [remember, setRemember] = useState(false);
  // 入力に添える一覧で選んでいるもの
  const [selected, setSelected] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const assistRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    show = (next) => {
      setValue(next.kind === "prompt" ? (next.initial ?? "") : "");
      setSelected(next.kind === "prompt" ? (next.select?.initial ?? "") : "");
      // 「次からはこれにする」と、確認に添えるチェックの初めの状態
      setRemember(next.kind === "confirm" || next.kind === "prompt" ? Boolean(next.check?.initial) : false);
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
    if (req.kind === "prompt" && req.assist) {
      assistRef.current?.focus();
    } else if (req.kind === "prompt" && req.multiline) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    } else if (req.kind === "prompt") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (req.kind === "confirm" && req.hideCancel) {
      ref.current?.querySelector<HTMLButtonElement>(".app-dialog-actions .btn-primary")?.focus();
    } else {
      cancelRef.current?.focus();
    }
  }, [req]);

  const finish = (ok: boolean, choice?: string) => {
    if (!req) return;
    if (req.kind === "confirm") req.resolve(ok, remember);
    else if (req.kind === "choice") req.resolve(ok ? (choice ?? null) : null, remember);
    else req.resolve(ok && (value.trim() || req.optional) ? value.trim() : null, remember, selected);
    setReq(null);
    ref.current?.close();
  };

  if (!req) return null;
  const confirmLabel = req.kind === "choice" ? "" : (req.confirmLabel ?? (req.kind === "prompt" ? "保存" : "OK"));
  const danger = req.kind === "confirm" && req.danger;

  return (
    <dialog
      ref={ref}
      className={`dialog app-dialog ${req.kind === "choice" ? "app-dialog-choice" : ""} ${req.kind === "prompt" && req.assist ? "app-dialog-assist" : ""}`}
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
        {req.kind === "prompt" && req.assist && <PromptAssist assist={req.assist} value={value} onPick={setValue} textRef={assistRef} />}
        {req.kind === "prompt" && (
          <label className="field">
            {req.label && <span className="field-label">{req.label}</span>}
            {req.multiline ? (
              <textarea
                ref={textareaRef}
                className="app-dialog-textarea"
                value={value}
                placeholder={req.placeholder}
                rows={3}
                maxLength={4000}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  // Enter で決める（Shift+Enter は改行・変換を確定する Enter は除く）
                  if (!isSubmitKey(e)) return;
                  e.preventDefault();
                  if (value.trim() || req.optional) finish(true);
                }}
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={value}
                placeholder={req.placeholder}
                maxLength={200}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </label>
        )}
        {req.kind === "prompt" && req.select && (
          <label className="field">
            <span className="field-label">{req.select.label}</span>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {req.select.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {req.kind === "choice" && req.remember && <CheckField className="app-dialog-remember" label={req.remember} checked={remember} onChange={setRemember} />}
        {(req.kind === "confirm" || req.kind === "prompt") && req.check && (
          <CheckField className="app-dialog-remember" label={req.check.label} help={req.check.help?.(remember)} checked={remember} onChange={setRemember} />
        )}
        <DialogActions className="app-dialog-actions" cancelRef={cancelRef} onCancel={req.kind === "confirm" && req.hideCancel ? undefined : () => finish(false)}>
          {req.kind === "choice" ? (
            req.choices.map((c) => (
              <button key={c.value} type="button" className={`btn ${c.primary ? "btn-primary" : c.danger ? "btn-danger" : ""}`} onClick={() => finish(true, c.value)}>
                {c.label}
              </button>
            ))
          ) : (
            <button
              type={req.kind === "prompt" ? "submit" : "button"}
              className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
              disabled={req.kind === "prompt" && !value.trim() && !req.optional}
              onClick={req.kind === "confirm" ? () => finish(true) : undefined}
            >
              {confirmLabel}
            </button>
          )}
        </DialogActions>
      </form>
    </dialog>
  );
}

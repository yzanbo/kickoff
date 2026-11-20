import { useEffect, useRef, useState } from "react";
import { isSubmitKey } from "@/foundation/ui/lib/keys";
import { setAskHost, type AskRequest } from "./ask";
import { finishAsk, nextAskId, pushAsk } from "./askQueue";
import { Dialog } from "./Dialog";
import { DialogActions } from "./DialogActions";
import { CheckField } from "./Field";
import { PromptAssist } from "./PromptAssist";

/** App に 1 つだけ置く（ダイアログを表示する場所）。開いている間に来た依頼は順番に待たせ、閉じたら次を出す */
export function AskHost() {
  const [queue, setQueue] = useState<readonly { id: number; req: AskRequest }[]>([]);
  useEffect(() => {
    setAskHost((req) => {
      const item = { id: nextAskId(), req };
      setQueue((q) => pushAsk(q, item));
    });
    return () => setAskHost(undefined);
  }, []);
  const head = queue[0];
  // 依頼ごとに作り直し、入力・チェックの状態を初めの値から始める
  return head ? <RequestDialog key={head.id} req={head.req} onDone={() => setQueue((q) => finishAsk(q, head))} /> : null;
}

/** 1 つの依頼のダイアログ */
function RequestDialog({ req, onDone }: { req: AskRequest; onDone: () => void }) {
  const [value, setValue] = useState(req.kind === "prompt" ? (req.initial ?? "") : "");
  // 「次からはこれにする」（初めは外す）・添えるチェック（checks の順）・入力に添える一覧で選んでいるもの
  const [remember, setRemember] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(() => (req.checks ?? []).map((c) => Boolean(c.initial)));
  const [selected, setSelected] = useState(req.kind === "prompt" ? (req.select?.initial ?? "") : "");
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const assistRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
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

  const done = useRef(false);
  const finish = (ok: boolean, choice?: string) => {
    // 決めたあとの close（Esc・背景と同じ知らせ）では、もう答えない
    if (done.current) return;
    done.current = true;
    if (req.kind === "confirm") req.resolve(ok, checked);
    else if (req.kind === "choice") req.resolve(ok ? (choice ?? null) : null, remember, checked);
    else req.resolve(ok && (value.trim() || req.optional) ? value.trim() : null, checked, selected);
    ref.current?.close();
    onDone();
  };

  const confirmLabel = req.kind === "choice" ? "" : (req.confirmLabel ?? (req.kind === "prompt" ? "保存" : "OK"));
  const danger = req.kind === "confirm" && req.danger;

  const actions = (
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
  );

  return (
    <Dialog
      dialogRef={ref}
      title={req.title}
      // 選択肢（ボタンが 3 つ以上並ぶ）と、案を作ってもらう欄のある入力（案が並ぶ）は広げる
      size={req.kind === "choice" || (req.kind === "prompt" && req.assist) ? 520 : undefined}
      onClose={() => finish(false)}
      onSubmit={() => finish(true)}
      actions={actions}
    >
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
      {req.checks?.map((check, i) => (
        <CheckField
          key={check.label}
          className="app-dialog-remember"
          label={check.label}
          help={check.help?.(checked[i] ?? false)}
          checked={checked[i] ?? false}
          onChange={(on) => setChecked((prev) => prev.map((v, j) => (j === i ? on : v)))}
        />
      ))}
    </Dialog>
  );
}

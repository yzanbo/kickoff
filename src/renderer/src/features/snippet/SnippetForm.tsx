import { useState, type KeyboardEvent } from "react";
import { SNIPPET_LABEL_MAX, SNIPPET_TEXT_MAX, type NewSnippetBody } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { consumeKey, isCancelKey, isKey } from "@/lib/keys";
import { ErrorText } from "@/ui/ErrorText";
import { Field } from "@/ui/Field";
import { Segmented } from "@/ui/Segmented";

/** 範囲の選択肢（null = 共通） */
export interface SnippetScope {
  value: number | null;
  label: string;
}

/** 範囲を Segmented / select の値（文字）にする */
const scopeKey = (value: number | null) => (value === null ? "common" : String(value));
const scopeOf = (key: string) => (key === "common" ? null : Number(key));

/**
 * 定型文の編集欄（名前（省略できる）・本文・使う範囲）。⌘Enter で保存、Esc でやめる。
 * 範囲の選択肢が 3 つまでなら並べたボタン（プロジェクトの中: 共通 / このプロジェクト）、多ければ選択欄（設定: 共通とすべてのプロジェクト）
 */
export function SnippetForm({
  initial,
  scopes,
  saveLabel,
  onSave,
  onCancel,
}: {
  initial: NewSnippetBody;
  scopes: SnippetScope[];
  saveLabel: string;
  onSave: (body: NewSnippetBody) => Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial.label ?? "");
  const [text, setText] = useState(initial.text);
  const [scope, setScope] = useState(scopeKey(initial.project_id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const canSave = text.trim() !== "" && !busy;
  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(undefined);
    try {
      await onSave({
        label: label.trim() || null,
        text,
        project_id: scopeOf(scope),
      });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (isKey(e, "Enter", { meta: true })) {
      consumeKey(e);
      void save();
    } else if (isCancelKey(e)) {
      // パネル・ダイアログを閉じる Esc に渡さず、編集だけをやめる
      consumeKey(e);
      onCancel();
    }
  };
  return (
    <div className="snippet-form" onKeyDown={onKeyDown}>
      <Field label="名前（省略できます）" help="帯のボタンに出す短い名前です。省くと本文の 1 行目を出します。">
        <input type="text" value={label} maxLength={SNIPPET_LABEL_MAX} placeholder="例: テストを流す" onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="本文" help="押すと入力欄のキャレットの位置に入ります（⌘クリックですぐ送ります）。">
        <textarea className="snippet-form-text" value={text} maxLength={SNIPPET_TEXT_MAX} autoFocus rows={4} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field as="div" label="使う範囲">
        {scopes.length <= 3 ? (
          <Segmented
            className="segmented theme-switch"
            label="使う範囲"
            value={scope}
            onChange={setScope}
            options={scopes.map((s) => ({
              value: scopeKey(s.value),
              label: s.label,
            }))}
          />
        ) : (
          <select value={scope} aria-label="使う範囲" onChange={(e) => setScope(e.target.value)}>
            {scopes.map((s) => (
              <option key={scopeKey(s.value)} value={scopeKey(s.value)}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <ErrorText message={error} />
      <div className="snippet-form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          キャンセル
        </button>
        <button type="button" className="btn btn-primary" disabled={!canSave} title="⌘Enter でも保存します" onClick={() => void save()}>
          {busy ? "保存中…" : saveLabel}
        </button>
      </div>
    </div>
  );
}

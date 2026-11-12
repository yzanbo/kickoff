import { useState, type KeyboardEvent, type RefObject } from "react";
import { isKey } from "@/lib/keys";
import { Markdown } from "@/ui/markdown/Markdown";
import { Segmented } from "@/ui/Segmented";

const MODES = ["write", "preview"] as const;
type Mode = (typeof MODES)[number];

/**
 * GitHub に書く Markdown の欄（コメント・issue の本文・レビュー・スレッドへの返信）。「書く｜プレビュー」で、書きながら見た目を確かめられる（要件 5.11 の段階 3）。
 * プレビューは Kickoff の Markdown の表示（GitHub の #番号・@名前の自動リンクは送ってから GitHub が付ける）。⌘Enter で onSubmit（送るボタンと同じ）
 */
export function GitHubMarkdownField({
  value,
  onChange,
  placeholder,
  label,
  onSubmit,
  disabled,
  autoFocus,
  inputRef,
  minRows = 3,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  onSubmit?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  minRows?: number;
}) {
  const [mode, setMode] = useState<Mode>("write");
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (onSubmit && (isKey(e, "Enter", { meta: true }) || isKey(e, "Enter", { ctrl: true }))) {
      e.preventDefault();
      onSubmit();
    }
  };
  return (
    <div className="github-md-field">
      <Segmented
        className="segmented github-md-mode"
        label={`${label}の表示`}
        value={mode}
        onChange={setMode}
        options={[
          { value: "write", label: "書く" },
          { value: "preview", label: "プレビュー" },
        ]}
      />
      {mode === "write" ? (
        <textarea
          ref={inputRef}
          className="github-md-input"
          value={value}
          rows={minRows}
          placeholder={placeholder}
          aria-label={label}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
      ) : (
        <div className="github-md-preview" style={{ minHeight: `${minRows * 1.5 + 1}em` }}>
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="muted small">プレビューするものがありません</p>}
        </div>
      )}
    </div>
  );
}

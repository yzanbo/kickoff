import { useState, type RefObject } from "react";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { cx } from "@/foundation/ui/lib/cx";
import { ErrorText } from "./ErrorText";
import { Field } from "./Field";

/** 入力のダイアログに添える、文から入力の案を作ってもらう欄（ワークツリーのブランチ名など。ask の prompt の assist） */
export interface PromptAssistOptions {
  /** 文の欄の名前（「やりたいこと」など） */
  label: string;
  placeholder?: string;
  /** 案を作るボタンの名前（「AI で提案」など） */
  buttonLabel: string;
  /** 書いた文から案を作る（失敗は投げる） */
  suggest: (text: string) => Promise<string[]>;
}

/**
 * 文を書いて「AI で提案」を押すと案が並び、押した案を入力欄に入れる（⌘Enter でも案を作る）。
 * 入力欄が空なら、いちばん目の案をそのまま入れる
 */
export function PromptAssist({
  assist,
  value,
  onPick,
  textRef,
}: {
  assist: PromptAssistOptions;
  /** いまの入力欄の値（選んでいる案を目立たせる・空なら案を入れる） */
  value: string;
  onPick: (value: string) => void;
  textRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  // 作っている間は押せない（ボタン・⌘Enter とも）
  const action = useAction<"suggest">();
  const busy = action.busy !== null;

  const run = () => {
    if (!text.trim() || busy) return;
    void action.run("suggest", async () => {
      const next = await assist.suggest(text.trim());
      setOptions(next);
      if (!value.trim() && next[0]) onPick(next[0]);
    });
  };

  return (
    <div className="prompt-assist">
      <Field label={assist.label} help="⌘Enter でも案を作ります">
        <textarea
          ref={textRef}
          rows={3}
          value={text}
          placeholder={assist.placeholder}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              run();
            }
          }}
        />
      </Field>
      <div className="prompt-assist-row">
        <button type="button" className="btn btn-sm" disabled={!text.trim() || busy} onClick={run}>
          {busy ? "考えています…" : assist.buttonLabel}
        </button>
      </div>
      {options.length > 0 && (
        <div className="prompt-assist-row" aria-label="案">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={cx("prompt-assist-option pill", option === value.trim() && "is-picked")}
              title="押すと、この名前を入れる"
              onClick={() => onPick(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
      <ErrorText message={action.error} />
    </div>
  );
}

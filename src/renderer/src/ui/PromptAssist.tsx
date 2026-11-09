import { useRef, useState, type RefObject } from "react";
import { errorMessage } from "@shared/errors";
import { cx } from "@/lib/cx";
import { ErrorText } from "./ErrorText";
import { Field } from "./Field";

/** 入力のダイアログに添える、文から入力の案を作ってもらう欄（ワークツリーのブランチ名など。promptDialog の assist） */
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [options, setOptions] = useState<string[]>([]);
  // 作っている途中で書き直して押し直したら、前の答えは捨てる
  const seq = useRef(0);

  const run = async () => {
    if (!text.trim() || busy) return;
    const mine = ++seq.current;
    setBusy(true);
    setError(undefined);
    try {
      const next = await assist.suggest(text.trim());
      if (mine !== seq.current) return;
      setOptions(next);
      if (!value.trim() && next[0]) onPick(next[0]);
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e));
    } finally {
      if (mine === seq.current) setBusy(false);
    }
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
              void run();
            }
          }}
        />
      </Field>
      <div className="prompt-assist-row">
        <button type="button" className="btn btn-sm" disabled={!text.trim() || busy} onClick={() => void run()}>
          {busy ? "考えています…" : assist.buttonLabel}
        </button>
      </div>
      {options.length > 0 && (
        <div className="prompt-assist-row" aria-label="案">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={cx("prompt-assist-option", option === value.trim() && "is-picked")}
              title="押すと、この名前を入れる"
              onClick={() => onPick(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
      <ErrorText message={error} />
    </div>
  );
}

import { useState } from "react";
import { errorMessage } from "../errors";

/** 保存などの結果の文（成功・失敗） */
export type ResultText = { kind: "ok" | "error"; text: string };

export type SaveState = ReturnType<typeof useSave>;

/**
 * 保存中かどうかと、その結果（保存しました・失敗の理由）。フォームごとに使う。
 * run は保存できたかを返す（続けて入力欄を空にするなど）。失敗の文だけを出すフォームは error を使う
 */
export function useSave() {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<ResultText>();
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setSaving(true);
    setMessage(undefined);
    try {
      await action();
      setMessage({ kind: "ok", text: "保存しました" });
      return true;
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { saving, message, error: message?.kind === "error" ? message.text : undefined, run };
}

import { useState } from "react";
import { errorMessage } from "../errors";

/** 保存などの結果の文（成功・失敗） */
export type ResultText = { kind: "ok" | "error"; text: string };

export type SaveState = ReturnType<typeof useSave>;

/** 保存中かどうかと、その結果（保存しました・失敗の理由）。フォームごとに使う */
export function useSave() {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<ResultText>();
  const run = async (action: () => Promise<unknown>) => {
    setSaving(true);
    setMessage(undefined);
    try {
      await action();
      setMessage({ kind: "ok", text: "保存しました" });
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };
  return { saving, message, run };
}

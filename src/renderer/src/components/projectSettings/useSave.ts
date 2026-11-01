import { useState } from "react";
import { errorMessage } from "../../errors";

type Message = { kind: "ok" | "error"; text: string } | undefined;

/** 保存ボタンと結果の表示（フォームごと） */
export function useSave() {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>();
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

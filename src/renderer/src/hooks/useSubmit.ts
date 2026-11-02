import { useState } from "react";
import { errorMessage } from "../errors";

/**
 * フォームの送信中かどうかと、失敗の文（プロジェクトの作成・取り込みなど）。
 * 送れたら閉じるフォーム向けで、成功しても submitting は戻さない（閉じるまでに二重に送らないため）。失敗したら戻して押し直せるようにする
 */
export function useSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (action: () => Promise<unknown>) => {
    setSubmitting(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  };
  return { submitting, error, setError, submit };
}

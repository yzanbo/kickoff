import { useState } from "react";
import { errorMessage } from "../errors";

/** 操作の失敗を画面に出すためのエラーと、操作を包んで失敗を受け止める guard（成功したらエラーを消す） */
export function useActionError() {
  const [error, setError] = useState<string>();
  const guard = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return { error, setError, guard };
}

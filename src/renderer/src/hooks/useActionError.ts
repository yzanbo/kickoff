import { useState } from "react";
import { errorMessage } from "@shared/errors";

/** 操作の失敗を画面に出すためのエラーと、操作を包んで失敗を受け止める guard（成功したらエラーを消して true、失敗したら false） */
export function useActionError() {
  const [error, setError] = useState<string>();
  const guard = async (action: () => Promise<unknown>): Promise<boolean> => {
    try {
      await action();
      setError(undefined);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };
  return { error, setError, guard };
}

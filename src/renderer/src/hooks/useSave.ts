import { useAction } from "./useAction";

export type SaveState = ReturnType<typeof useSave>;

/**
 * 保存中かどうかと、その結果（保存しました・失敗の理由）。フォームごとに使う（useAction の、保存のボタン向けの形）。
 * run は保存できたかを返す（続けて入力欄を空にするなど）。失敗の文だけを出すフォームは error を使う
 */
export function useSave() {
  const action = useAction<"save">();
  return {
    saving: action.busy !== null,
    message: action.result,
    error: action.error,
    run: (save: () => Promise<unknown>) => action.run("save", save, { done: "保存しました" }),
  };
}

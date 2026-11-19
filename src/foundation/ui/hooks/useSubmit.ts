import { useAction } from "./useAction";

/**
 * フォームの送信中かどうかと、失敗の文（プロジェクトの作成・取り込み・回答など。useAction の、送れたら閉じるフォーム向けの形）。
 * 成功しても submitting は戻さない（閉じる・消えるまでに二重に送らないため）。失敗したら戻して押し直せるようにする
 */
export function useSubmit() {
  const action = useAction<"submit">();
  return {
    submitting: action.busy !== null,
    error: action.error,
    setError: action.setError,
    submit: (send: () => Promise<unknown>) => action.run("submit", send, { keepBusy: true }),
  };
}

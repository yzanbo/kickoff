import { useCallback, useState } from "react";
import { errorMessage } from "@shared/errors";

/** 操作の結果の文（成功・失敗） */
export type ResultText = { kind: "ok" | "error"; text: string };

interface RunOptions {
  /** 成功したときに出す文（省けば、成功したら何も出さない） */
  done?: string;
  /** 成功しても実行中のままにする（送れたら閉じる・消えるもの。閉じるまでに二重に送らないため）。失敗したら戻して押し直せるようにする */
  keepBusy?: boolean;
}

/**
 * ボタンなどの操作の、実行中と結果（失敗の文・成功の文）。部品ごとに 1 つ。
 * run(name, action) で包むと、終わるまで busy にその名前を立て（押せなくする・「〜中…」を出す）、失敗したら error に文を入れる。成功したかを返す。
 * guard(action) は busy を立てずに、失敗だけを受け止める（行の操作・裏での取り直しなど。成功したら前の失敗の文を消す）。
 * 保存のボタン（「保存しました」）は useSave、送れたら閉じるフォームは useSubmit（どちらもこれを包んだもの）
 */
export function useAction<Name extends string = string>() {
  const [busy, setBusy] = useState<Name | null>(null);
  const [result, setResult] = useState<ResultText>();
  const setError = useCallback((text: string | undefined) => setResult(text === undefined ? undefined : { kind: "error", text }), []);

  const run = async (name: Name, action: () => Promise<unknown>, { done, keepBusy = false }: RunOptions = {}): Promise<boolean> => {
    setBusy(name);
    setResult(undefined);
    try {
      await action();
      if (done) setResult({ kind: "ok", text: done });
      if (!keepBusy) setBusy(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
      return false;
    }
  };

  const guard = async (action: () => Promise<unknown>): Promise<boolean> => {
    try {
      await action();
      setResult(undefined);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };

  return {
    /** 実行中の操作の名前（なければ null） */
    busy,
    /** 最後の操作の結果の文（成功の文は done を渡したときだけ） */
    result,
    /** 失敗の文（なければ undefined） */
    error: result?.kind === "error" ? result.text : undefined,
    /** 失敗の文を出す・消す（操作の前の確かめで断るときなど。参照は変わらない） */
    setError,
    /** 結果の文を消す */
    reset: () => setResult(undefined),
    run,
    guard,
  };
}

export type ActionState<Name extends string = string> = ReturnType<typeof useAction<Name>>;

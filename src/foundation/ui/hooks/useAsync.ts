import { useEffect, useEffectEvent, useState } from "react";
import { errorMessage } from "@shared/foundation/errors";

/** 非同期の読み込み状態をまとめて扱う */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  // 取り直すきっかけは deps と reload だけ（load は描くたびに作られるので、依存に入れず最新のものを呼ぶ）
  const startLoad = useEffectEvent(() => load());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    startLoad()
      .then((d) => alive && (setData(d), setError(undefined)))
      .catch((e: unknown) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [...deps, nonce]);

  return { data, setData, error, loading, reload: () => setNonce((n) => n + 1) };
}

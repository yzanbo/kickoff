import { useEffect, useState } from "react";
import { reportFailure } from "./ask";

/** コピーしたことを見せておく時間 */
const COPIED_MS = 1500;

/**
 * コピーして、しばらく「コピーしました」を見せる（copied が true の間）。copy にはクリップボードに書く処理を渡す。
 * 失敗はお知らせで出す。見せている間に外した・またコピーしたら、前のタイマーは消す
 */
export function useCopied(): { copied: boolean; copy: (write: () => Promise<void>) => void } {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  return { copied, copy: (write) => void write().then(() => setCopied(true), reportFailure("コピーできませんでした")) };
}

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { reportFailure } from "../runActions";
import { IconButton } from "./IconButton";

/** コピーしたことを見せておく時間 */
const COPIED_MS = 1500;

/** 文をクリップボードにコピーするボタン（コピーしたら、しばらくチェックの印にする） */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <IconButton
      icon={copied ? Check : Copy}
      label={copied ? "コピーしました" : label}
      size={13}
      type="button"
      className={className}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => setCopied(true), reportFailure("コピーできませんでした"));
      }}
    />
  );
}

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { reportFailure } from "@/features/chat/chatActions";
import { IconButton } from "./IconButton";

/** コピーしたことを見せておく時間 */
const COPIED_MS = 1500;

/**
 * クリップボードにコピーするボタン（コピーしたら、しばらくチェックの印にする。失敗はお知らせ）。
 * 文なら text、画像など文以外は copy（クリップボードに書く処理）を渡す
 */
export function CopyButton({
  label,
  className,
  size = 13,
  ...source
}: { label: string; className?: string; size?: number } & ({ text: string } | { copy: () => Promise<void> })) {
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
      size={size}
      type="button"
      className={className}
      onClick={() => {
        const write = "copy" in source ? source.copy() : navigator.clipboard.writeText(source.text);
        write.then(() => setCopied(true), reportFailure("コピーできませんでした"));
      }}
    />
  );
}

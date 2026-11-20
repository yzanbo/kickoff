import { Check, Copy } from "lucide-react";
import { useCopied } from "./useCopied";
import { IconButton, type IconButtonSize } from "./IconButton";

/**
 * クリップボードにコピーするボタン（コピーしたら、しばらくチェックの印にする。失敗はお知らせ）。
 * 文なら text、画像など文以外は copy（クリップボードに書く処理）を渡す
 */
export function CopyButton({
  label,
  className,
  size,
  iconSize = 13,
  ...source
}: { label: string; className?: string; size?: IconButtonSize; iconSize?: number } & ({ text: string } | { copy: () => Promise<void> })) {
  const { copied, copy } = useCopied();
  return (
    <IconButton
      icon={copied ? Check : Copy}
      label={copied ? "コピーしました" : label}
      iconSize={iconSize}
      size={size}
      type="button"
      className={className}
      onClick={() => copy("copy" in source ? source.copy : () => navigator.clipboard.writeText(source.text))}
    />
  );
}

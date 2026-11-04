import { Paperclip } from "lucide-react";
import { useRef } from "react";
import { IconButton } from "@/ui/IconButton";

/**
 * 📎 のボタン（押すとファイルを選ぶ。チャット欄・送信待ちの書き直し・質問の「その他」で共通）。
 * 選んだファイルは onFiles に渡し（useComposerFiles の addFiles）、同じファイルをもう一度選べるよう選んだあとは空に戻す。
 * onOpen は選ぶ前に呼ぶ（質問の「その他」を選ぶなど）
 */
export function AttachButton({
  onFiles,
  onOpen,
  size = 14,
  className,
}: {
  onFiles: (files: FileList) => void;
  onOpen?: () => void;
  size?: number;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <IconButton
        icon={Paperclip}
        label="ファイルを添付"
        title="ファイルを添付（貼り付け・ドラッグ＆ドロップでも）"
        size={size}
        className={className}
        type="button"
        onClick={() => {
          onOpen?.();
          inputRef.current?.click();
        }}
      />
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

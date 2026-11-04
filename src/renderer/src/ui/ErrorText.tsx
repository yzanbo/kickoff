import { cx } from "@/lib/cx";

/** 操作や読み込みの失敗の文（なければ何も出さない） */
export function ErrorText({ message, className }: { message: string | undefined; className?: string }) {
  if (!message) return null;
  return <p className={cx("error small", className)}>{message}</p>;
}

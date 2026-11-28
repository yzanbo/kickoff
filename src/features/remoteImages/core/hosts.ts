// 表示を許可するホストの名前のそろえ方（チャットとノートで同じ）
import { Invalid } from "@/foundation/core/errors";

/** 小文字にそろえたホストの名前（空・空白・/・@ を含むものは 400） */
export function normalizedHost(host: string): string {
  const normalized = host.trim().toLowerCase();
  if (!normalized || /[\s/@]/.test(normalized)) throw new Invalid("ホストの名前が正しくありません");
  return normalized;
}

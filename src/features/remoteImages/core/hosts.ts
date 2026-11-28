// 表示を許可するホストの名前のそろえ方（チャットとノートで同じ）
import { z } from "zod";
import { Invalid } from "@/foundation/core/errors";

/** 受け口で受けるホストの名前（形は normalizedHost が確かめる） */
export const hostSchema = z.string().trim().min(1).max(300);

/** 覚えるときのホストの名前（小文字。許可を外すときは、許可したときと同じ形で引く） */
export const hostKey = (host: string): string => host.trim().toLowerCase();

/** 小文字にそろえたホストの名前（空・空白・/・@ を含むものは 400） */
export function normalizedHost(host: string): string {
  const normalized = hostKey(host);
  if (!normalized || /[\s/@]/.test(normalized)) throw new Invalid("ホストの名前が正しくありません");
  return normalized;
}

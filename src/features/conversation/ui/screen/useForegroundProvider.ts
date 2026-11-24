import { useEffect } from "react";
import type { ProviderId } from "@shared/settings/types";
import { noteForegroundProvider } from "@/features/ai/ui";

/**
 * 前に出しているチャット（送る前のチャットも）の AI を、下の帯の使用状況に出す。visible を渡すと、表に出たときに出す（裏のタブでは上書きしない）。
 * 返す関数は触ったとき（押した・ピントが入った。分けたペインで隣のチャットへ移ったとき）に呼ぶ。key はチャットごとの名前（chat:<ID>・draft:<ID>）
 */
export function useForegroundProvider(provider: ProviderId, key: string, visible?: boolean): () => void {
  useEffect(() => {
    if (visible) noteForegroundProvider(provider, key);
  }, [visible, provider, key]);
  return () => noteForegroundProvider(provider, key);
}

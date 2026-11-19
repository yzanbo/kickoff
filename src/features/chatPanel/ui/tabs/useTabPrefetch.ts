// パネルのまだ描いていないチャットのタブの先読みを頼む（選び方は tabPrefetch.ts）
import { useEffect } from "react";
import { prefetchChats } from "@/features/chat/ui/store/useChatStore";

/** 先読みを頼む（並びが変わったときだけ。パネルが閉じている間は頼まない） */
export function useTabPrefetch(chatIds: readonly number[], open: boolean) {
  const key = chatIds.join(",");
  useEffect(() => {
    if (open && key) prefetchChats(key.split(",").map(Number));
  }, [key, open]);
}

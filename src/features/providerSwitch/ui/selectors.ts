// AI を切り替えた区切りの取り出し口
import { providerAtEvent, providerBoundaries } from "@shared/providerSwitch/providerSwitch";
import type { ProviderId } from "@shared/settings/types";
import { defineChatSelector, memoLast } from "@/features/chat/ui";

/** AI を切り替えた区切り（いまの AI・最後に切り替えた記録の ID） */
const providerTimeline = defineChatSelector(["detail", "log"], () => {
  const bounds = memoLast(providerBoundaries);
  const lastSwitch = memoLast((digest: Parameters<typeof providerBoundaries>[0]): number => {
    let last = 0;
    for (const event of digest) if (event.type === "provider_switched") last = Math.max(last, event.id);
    return last;
  });
  const timeline = memoLast((b: ReturnType<typeof providerBoundaries>, current: ProviderId | null, last: number) => ({ bounds: b, current, last }));
  return (src, chatId) => {
    const { digest } = src.log(chatId);
    return timeline(bounds(digest), src.detail(chatId).chat?.provider ?? null, lastSwitch(digest));
  };
});

/** その記録が、AI を切り替えた区切りより前か */
export const useBeforeProviderSwitch = (chatId: number, eventId: number): boolean => providerTimeline.useWith(chatId, (t) => t.last > eventId);

/** その発言を返した AI（途中で AI を替える前の返答も元の担当で表示する） */
export const useProviderAtEvent = (chatId: number, eventId: number): ProviderId | null =>
  providerTimeline.useWith(chatId, (t) => (t.current ? providerAtEvent(t.bounds, eventId, t.current) : null));

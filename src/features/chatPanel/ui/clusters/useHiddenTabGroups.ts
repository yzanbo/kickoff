import { useMemo } from "react";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/chatPanel/ui/storage";

/**
 * タブの列（グループ別）で隠すグループ: 自分で作ったグループを 1 つずつ隠す（storage.settings.hiddenGroups）と、
 * チャットもタブもないグループの札を隠す（storage.settings.hideEmptyGroups）。どちらもすべてのパネル・ペインで共通。
 * グループなし（No Group）・固定・アーカイブ済みは隠せない
 */
export function useHiddenTabGroups() {
  const [ids, setIds] = useSetting(storage.settings.hiddenGroups);
  const [hideEmpty, setHideEmpty] = useSetting(storage.settings.hideEmptyGroups);
  const hidden = useMemo(() => new Set(ids.map(Number)), [ids]);
  return {
    /** 隠しているグループの ID */
    hidden,
    /** グループを隠す・出す */
    toggle: (groupId: number) => setIds(hidden.has(groupId) ? ids.filter((id) => Number(id) !== groupId) : [...ids, String(groupId)]),
    /** いくつかのグループをまとめて出す（「すべて表示」） */
    show: (groupIds: readonly number[]) => setIds(ids.filter((id) => !groupIds.includes(Number(id)))),
    hideEmpty,
    setHideEmpty,
  };
}

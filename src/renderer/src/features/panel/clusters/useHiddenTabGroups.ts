import { useMemo } from "react";
import { useSetting } from "@/hooks/useSetting";
import { PANEL_HIDDEN_GROUPS, PANEL_HIDE_EMPTY_GROUPS } from "@/lib/storageKeys";

/**
 * タブの列（グループ別）で隠すグループ: 自分で作ったグループを 1 つずつ隠す（PANEL_HIDDEN_GROUPS）と、
 * チャットもタブもないグループの札を隠す（PANEL_HIDE_EMPTY_GROUPS）。どちらもすべてのパネル・ペインで共通。
 * グループなし（No Group）・固定・アーカイブ済みは隠せない
 */
export function useHiddenTabGroups() {
  const [ids, setIds] = useSetting(PANEL_HIDDEN_GROUPS);
  const [hideEmpty, setHideEmpty] = useSetting(PANEL_HIDE_EMPTY_GROUPS);
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

import { useState, type DragEvent } from "react";
import { api } from "@/api";
import { reportFailure } from "@/ui/dialogs";
import { setDraftGroup } from "@/features/panel/state/panelDrafts";
import type { PanelController } from "@/features/panel/usePanel";
import { clusterGroupOf, clusterTabDrop } from "./clusterTabDrop";
import type { TabCluster } from "./tabClusters";

/** まとまりの枠に付けるドロップの受け口 */
interface DropHandlers {
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
}

/**
 * タブの列をグループ別にまとめているとき、チャットのタブを別のグループのまとまりの枠（No Group も）に落とすと、
 * チャットをそのグループへ移す（サイドバー・全プロジェクトのボードのグループの列へのドラッグと同じ api.setChatGroup）。送る前の新しいチャット（下書き）は作成先のグループを変える。
 * 移せるかは clusterTabDrop（同じプロジェクトのグループだけ・子チャットは移さない）。落とす位置の印・ペインの中の並べ替えはタブの列（useTabDrag）に任せ、
 * ここは移せる枠を点線で示して、落としたらグループを変えるだけ
 */
export function useClusterTabDrop(panel: PanelController, dragging: string | null, enabled: boolean) {
  // ドラッグ中のタブを重ねている、移せるまとまりのキー
  const [over, setOver] = useState<string | null>(null);

  /** ドラッグ中のタブをそのまとまりに落としたときに変えるもの（移せなければ null） */
  const dropOf = (c: TabCluster) => {
    const tab = enabled && dragging !== null ? panel.tabs.find((t) => t.key === dragging) : undefined;
    return tab ? clusterTabDrop(c, tab, panel.chatOf(tab)) : null;
  };

  return {
    /** まとまりの枠に付ける受け口（グループ別のときの、グループ・グループなしのまとまりだけ） */
    dropProps: (c: TabCluster): DropHandlers | undefined => {
      if (!enabled || clusterGroupOf(c) === undefined) return undefined;
      return {
        // 落とせるようにする preventDefault は、タブの列（親）の受け口がする
        onDragOver: () => {
          if (dropOf(c) && over !== c.key) setOver(c.key);
        },
        onDragLeave: (e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null) && over === c.key) setOver(null);
        },
        onDrop: () => {
          const drop = dropOf(c);
          setOver(null);
          if (drop?.kind === "chat") void api.setChatGroup(drop.chatId, drop.groupId).catch(reportFailure("グループへ移せませんでした"));
          else if (drop) setDraftGroup({ panel: panel.key, key: drop.tabKey }, drop.groupId ?? undefined, drop.groupName);
        },
      };
    },
    /** 移せる枠に重ねているときのクラス */
    classFor: (c: TabCluster) => (over === c.key && dropOf(c) ? "drop-target" : ""),
  };
}

/** 同じ枠に付ける受け口をつなぐ（グループの札の並べ替えと、タブを落としてグループへ移すの両方） */
export function joinDropHandlers(...list: (DropHandlers | undefined)[]): DropHandlers {
  const all = list.filter((h): h is DropHandlers => h !== undefined);
  return {
    onDragOver: (e) => all.forEach((h) => h.onDragOver?.(e)),
    onDragLeave: (e) => all.forEach((h) => h.onDragLeave?.(e)),
    onDrop: (e) => all.forEach((h) => h.onDrop?.(e)),
  };
}

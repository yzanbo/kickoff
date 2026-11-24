// パネルのまだ描いていないタブ（中身を作る時が shown の種類。チャット）を、表のタブに近い順に先読みする。
// チャットのタブはサイドバーと連動して増え、中身は初めて表示したときに作るので、切り替えた最初の 1 回が「初めて開く」になる。
// 隣のタブを手すきのときに読んでおけば、切り替えたときに読み込みを待たない（読み方は種類の prefetch）
import { useEffect } from "react";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import type { TabBase } from "@/features/panel/ui/kind";
import { kindOf } from "@/features/panel/ui/state/panelStore";

/** 先読みするタブの数（パネル全体で） */
const TAB_PREFETCH_LIMIT = 5;

/** ペインのタブの並びと表のタブ */
export interface PaneTabs {
  tabs: readonly string[];
  shown: string | null;
}

/** 先読みするタブのキー（表のタブに近い順。ペインをまたいで近いものから limit 件）。wants は先読みするタブか（先読みしない種類・もう描いたタブは false） */
export function neighborTabs(panes: readonly PaneTabs[], wants: (key: string) => boolean, limit = TAB_PREFETCH_LIMIT): string[] {
  const near: { distance: number; key: string }[] = [];
  for (const pane of panes) {
    const at = pane.shown === null ? 0 : Math.max(0, pane.tabs.indexOf(pane.shown));
    pane.tabs.forEach((key, i) => {
      if (key !== pane.shown && wants(key)) near.push({ distance: Math.abs(i - at), key });
    });
  }
  near.sort((a, b) => a.distance - b.distance);
  return [...new Set(near.map((n) => n.key))].slice(0, limit);
}

/** 先読みを種類ごとに頼む（並びが変わったときだけ。パネルが閉じている間は頼まない） */
export function useTabPrefetch(tabs: readonly TabBase[], open: boolean) {
  const key = tabs.map((t) => t.key).join("\n");
  const latest = useLatest(tabs);
  useEffect(() => {
    if (!open || !key) return;
    const byKind = new Map<ReturnType<typeof kindOf>, TabBase[]>();
    for (const t of latest.current) byKind.set(kindOf(t), [...(byKind.get(kindOf(t)) ?? []), t]);
    for (const [kind, list] of byKind) kind.prefetch?.(list);
  }, [key, open, latest]);
}

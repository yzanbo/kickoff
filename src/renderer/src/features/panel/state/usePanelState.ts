import { useEffect, useMemo, useRef, useState } from "react";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";
import { activeTabOf, reconcileLayout, type PaneLayout } from "@/features/panel/layout/paneLayout";
import type { LinkState } from "./linkedTabs";
import { loadPanel, savePanel } from "./panelMemory";

/**
 * 右のパネル（usePanel）の覚えておく状態: タブ・分割の配置・開いているか・サイドバーと連動したチャットのタブの覚え。
 * memoryKey（ボードごと）に覚え（panelMemory.ts）、同じ部品のまま別のボードに切り替わったら、そのボードで覚えている状態に戻す
 */
export function usePanelState(memoryKey: string) {
  // パネルを閉じてもタブは残し、次に開いたときに戻す
  const saved = () => loadPanel(memoryKey);
  const [tabs, setTabs] = useState<PanelTab[]>(() => saved().tabs);
  // 分割の配置（タブのキーを指す木と、ピントのあるペイン）
  const [rawLayout, setLayout] = useState<PaneLayout>(() => saved().layout);
  const [panelOpen, setPanelOpen] = useState(() => saved().panelOpen);
  // サイドバーと連動したチャットのタブの覚え（表示だけ消したもの・一覧にないのに開いたもの）
  const [links, setLinks] = useState<LinkState>(() => saved().links);
  // 同じ部品のまま別のボード（プロジェクト）に切り替わったら、そのボードで覚えている状態に戻す
  const [shownKey, setShownKey] = useState(memoryKey);
  if (shownKey !== memoryKey) {
    const next = saved();
    setShownKey(memoryKey);
    setTabs(next.tabs);
    setLayout(next.layout);
    setPanelOpen(next.panelOpen);
    setLinks(next.links);
  }
  // 配置といまのタブが食い違っても（どのペインにもないタブなど）壊れないよう、直したものを使う
  const layout = useMemo(() => reconcileLayout(rawLayout, tabs.map((t) => t.key)), [rawLayout, tabs]);
  /**
   * 配置を変える。いまのタブに合わせて直した配置から変える（サイドバーと連動して自動で足したタブは、state の配置にはまだ入っていない。
   * 直さずに変えると、そのタブを移す・分ける操作が「どのペインにもないタブ」として何もしなかった）
   */
  const tabKeys = useRef<string[]>([]);
  tabKeys.current = tabs.map((t) => t.key);
  const changeLayout = (fn: (l: PaneLayout) => PaneLayout) => setLayout((l) => fn(reconcileLayout(l, tabKeys.current)));
  /** ピントのあるペインの表示中のタブ（分割する前の「表示中のタブ」と同じ意味） */
  const activeTab = activeTabOf(layout);
  // いまのボードの状態か（切り替わった直後の描き直しでは、前のボードの状態を新しいボードに書かない）
  const current = shownKey === memoryKey;
  useEffect(() => {
    if (current) savePanel(memoryKey, { tabs, activeTab, panelOpen, layout, links });
  }, [memoryKey, current, tabs, activeTab, panelOpen, layout, links]);

  return { tabs, setTabs, layout, setLayout, changeLayout, activeTab, panelOpen, setPanelOpen, links, setLinks, current };
}

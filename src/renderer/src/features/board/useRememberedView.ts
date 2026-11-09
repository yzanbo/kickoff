import { useEffect, useRef } from "react";
import { useSetting } from "@/hooks/useSetting";
import { ALL_PROJECTS_LAST_VIEW, PROJECT_LAST_VIEW } from "@/lib/storageKeys";
import { parseViewState, sameViewState, type BoardViewState } from "./savedViews";
import type { useSavedViews } from "./useSavedViews";

/**
 * ボードごとに最後の見え方を覚え、ボードを開いたときに戻す（利用者の依頼: 初めは最初のビューを選んだ状態で開き、それからは前回の見え方を保つ。
 * アプリを閉じて開いても同じ）。表示・並び順などの設定はすべてのボードで共通なので、全プロジェクトのボードで変えた見え方が、
 * プロジェクトのボードにもそのまま移って、どのビューにも合わなくなっていた。
 * 覚えるのは全プロジェクトのボード（ALL_PROJECTS_LAST_VIEW）とプロジェクトのボード（PROJECT_LAST_VIEW。すべてのプロジェクトで共通）の 2 つ。
 * アーカイブの絞り込みも戻す（ビューの一部なので。ビューのタブを押したときと同じく、サイドバー・右のパネルのタブのアーカイブを出すかも連動して変わる。
 * 前はそのままにしていたが、アーカイブ済みを出していると最初のビューに合わず、どのタブも選ばれていない形で開いた）
 */
export function useRememberedView(saved: ReturnType<typeof useSavedViews>, allProjects: boolean) {
  const [remembered, setRemembered] = useSetting(allProjects ? ALL_PROJECTS_LAST_VIEW : PROJECT_LAST_VIEW);
  // どちらのボードの見え方を戻したか（戻す前に、もう一方のボードの見え方で上書きしないように）
  const restoredFor = useRef<boolean | null>(null);
  const current = saved.current;

  // 覚える（このボードの見え方を戻したあとの描き直しから。戻す effect より先に置き、戻した描き直しではまだ覚えない）
  useEffect(() => {
    if (restoredFor.current !== allProjects) return;
    if (JSON.stringify(remembered) !== JSON.stringify(current)) setRemembered(current);
  });

  // 戻す（開いたとき・ボードの種類が変わったとき）
  useEffect(() => {
    if (restoredFor.current === allProjects) return;
    restoredFor.current = allProjects;
    const target: BoardViewState | undefined = (remembered && parseViewState(remembered)) || saved.views[0]?.state;
    if (!target) return;
    if (!sameViewState(target, current)) saved.apply(target);
    // 開いたとき・ボードの種類が変わったときだけ戻す（見え方が変わるたびには戻さない）
  }, [allProjects]);
}

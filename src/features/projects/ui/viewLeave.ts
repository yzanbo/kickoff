// プロジェクトの画面を離れる前の確かめ: 中の部品は書きかけ（DB の表の変更など）を土台の未保存の登録簿に置き場所の名前 unsavedSurface で出し、
// 入れ物（真ん中のタブ = ルーターの移動・右サイドバー・チャットの右の欄）は画面・作業場所を替える・タブを閉じる前にその名前で聞く
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { confirmLeave, hasUnsaved } from "@/foundation/ui/document/unsaved";
import type { Route, RouteLeaveGuard } from "@/foundation/ui/navigation/router";
import { readSetting } from "@/foundation/ui/storage";
import { CHAT_PLACEMENT } from "@/foundation/ui/storage/storageKeys";
import { boardTabOf } from "./page/chatPlacement";
import { resolveProjectView, type ProjectViewPlace } from "./projectViews";
import { isCommonProjectId } from "./projectColor";

/** 画面 1 つの、未保存の登録簿の置き場所の名前（真ん中・右サイドバーはプロジェクトごと、チャットの右の欄はチャットごと） */
export const projectViewSurface = ({ place, projectId, chatId, view }: { place: ProjectViewPlace; projectId: number; chatId?: number; view: string }): string =>
  `project-view:${place === "chatSide" ? `chat-${chatId ?? 0}` : `${place}-${projectId}`}:${view}`;

/** その画面を離れてよいか（書きかけがあれば保存するかを聞く。なければ聞かずに true） */
export const confirmLeaveView = (surface: string, action: string): Promise<boolean> => confirmLeave((e) => e.surface === surface, { action });

/** その URL で真ん中に出す画面の置き場所の名前（プロジェクトの画面でなければ null。ProjectPage と同じ決め方） */
function centerSurfaceOf(route: Route): string | null {
  if (route.name === "allProjects" || route.name === "allNotes") return null;
  const placement = readSetting(CHAT_PLACEMENT);
  const tab = route.name === "project" ? route.tab : boardTabOf(placement);
  const projectId = route.name === "project" ? route.id : route.projectId;
  const view = resolveProjectView(tab, placement === "separate", isCommonProjectId(projectId))?.id ?? "board";
  return projectViewSurface({ place: "center", projectId, view });
}

/** ルーターの移動の前: 真ん中の画面が替わる・外れる（別のタブ・チャット・別のプロジェクト・全プロジェクト・全ノートへ移る）なら、その画面の書きかけを聞く */
export const leaveProjectView: RouteLeaveGuard = (from, to) => {
  const surface = centerSurfaceOf(from);
  if (!surface || surface === centerSurfaceOf(to) || !hasUnsaved((e) => e.surface === surface)) return null;
  return confirmLeaveView(surface, "画面を切り替えます。");
};

/**
 * 出すもの（画面の名前・作業場所）を wanted に替える前に、いま出しているものの書きかけを確かめる。
 * 書きかけがなければ描くときにすぐ替え、あれば聞いてから替える（やめたら revert(いま出しているもの) で頼んだ側を元に戻す）
 */
export function useLeaveGuard<T>(wanted: T, surfaceOf: (shown: T) => string, revert: (shown: T) => void, action: string): T {
  const [shown, setShown] = useState(wanted);
  const asking = wanted !== shown && hasUnsaved((e) => e.surface === surfaceOf(shown));
  if (wanted !== shown && !asking) setShown(wanted);
  // 同じ頼みを 2 回聞かない（StrictMode の effect の流し直し）
  const asked = useRef<{ value: T } | null>(null);
  const ask = useEffectEvent((target: T) => {
    void confirmLeaveView(surfaceOf(shown), action).then((ok) => {
      if (asked.current?.value !== target) return;
      asked.current = null;
      if (ok) setShown(target);
      else revert(shown);
    });
  });
  useEffect(() => {
    if (!asking || asked.current?.value === wanted) return;
    asked.current = { value: wanted };
    ask(wanted);
  }, [asking, wanted]);
  return shown;
}

// ほかの場所から右サイドバーで開くよう頼まれたファイル・ノート（右サイドバーがその中身を見せているときだけ）。
// 中身の部品が受け取って開いたら片付ける（同じ頼みで開き直さない）
import { useSyncExternalStore } from "react";
import { setSideOpener, type SideOpenTarget } from "@/foundation/ui/navigation/router";
import { sidePanelsHandedOut } from "@/features/panel/ui/state/panelHandOff";
import { isSideViewShown } from "./sideView";

export type SideOpenRequest = SideOpenTarget;

const requests = new Map<number, SideOpenRequest>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** そのプロジェクトの右サイドバーで開くよう頼む（前の頼みは置き換える） */
function requestSideOpen(projectId: number, request: SideOpenRequest): void {
  requests.set(projectId, request);
  emit();
}

/** 受け取って開いた頼みを片付ける */
export function takeSideOpenRequest(projectId: number): void {
  if (requests.delete(projectId)) emit();
}

/** そのプロジェクトの右サイドバーへの頼み（kind の種類のものだけ） */
export function useSideOpenRequest<K extends SideOpenRequest["kind"]>(projectId: number, kind: K): Extract<SideOpenRequest, { kind: K }> | undefined {
  const request = useSyncExternalStore(subscribe, () => requests.get(projectId));
  return request?.kind === kind ? (request as Extract<SideOpenRequest, { kind: K }>) : undefined;
}

// ファイル・ノートを開く口（openProjectFile・openNote）が、右サイドバーがファイル・ノートを見せていればここへ頼む。
// 頼みはこのウィンドウの中だけに置くので、右サイドバーを別ウィンドウへ移しているときは、真ん中のタブで開く
setSideOpener((projectId, target) => {
  if (sidePanelsHandedOut() || !isSideViewShown(projectId, target.kind === "file" ? "files" : "notes")) return false;
  requestSideOpen(projectId, target);
  return true;
});

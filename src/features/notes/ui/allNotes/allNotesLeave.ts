// 全ノートの画面を離れる前の確かめ（プロジェクトの画面の viewLeave と同じく、開いているノートの書きかけを聞く）
import { confirmLeave, hasUnsaved } from "@/foundation/ui/document/unsaved";
import type { RouteLeaveGuard } from "@/foundation/ui/navigation/router";

/** 全ノートの画面の、未保存の登録簿の置き場所の名前（画面が中のノートに UnsavedSurfaceContext で渡す） */
export const ALL_NOTES_SURFACE = "all-notes";

const inAllNotes = (e: { surface: string }) => e.surface === ALL_NOTES_SURFACE;

/** ルーターの移動の前: 全ノートの画面からほかの画面へ移るなら、開いているノートの書きかけを聞く */
export const leaveAllNotes: RouteLeaveGuard = (from, to) => {
  if (from.name !== "allNotes" || to.name === "allNotes" || !hasUnsaved(inAllNotes)) return null;
  return confirmLeave(inAllNotes, { action: "画面を切り替えます。" });
};

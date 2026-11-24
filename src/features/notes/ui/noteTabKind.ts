// ノートのタブの種類（チャットの画面の右の欄とノートのタブの右に開くノート。自動で保存）。ui/contributes.ts が panelTabs に入れる
import { StickyNote } from "lucide-react";
import { baseName } from "@/foundation/ui/lib/format";
import { defineTabKind } from "@/features/panel/ui";
import { confirmLeaveNote } from "./noteLeave";
import { NotePage, type NoteTab } from "./noteTabPage";

export const noteTabKind = defineTabKind<NoteTab>({
  id: "note",
  icon: StickyNote,
  badge: "ノート",
  label: (t) => baseName(t.path),
  hint: (t) => `ノート: ${t.path}`,
  projectOf: (t) => t.projectId,
  // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）。ノートのタブの右（notes）で開いたものはチャットなし
  ownerChatId: (t) => t.chatId,
  // 保存していない書きかけがあれば保存するかを聞く
  confirmClose: (t) => confirmLeaveNote(t.projectId, t.path),
  popout: (t) => ({ route: { kind: "note", projectId: t.projectId, path: t.path, ...(t.chatId !== null ? { chatId: t.chatId } : {}) }, title: `${baseName(t.path)} — ノート` }),
  Page: NotePage,
});

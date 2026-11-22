// notes が拡張点に出すもの（app/renderer/registry.ts が入れる）
import { openTargets } from "@/foundation/ui/navigation/open";
import { lazyPart } from "@/foundation/ui/points";
import { messageActions, type MessageMenuContext, type SelectionContext } from "@/features/conversation/ui";
import { composerSlots } from "@/features/composer/ui";
import { panelSurfaces, panelTabs } from "@/features/panel/ui";
import { noteFromVisualTarget, noteTarget } from "./openTargets";
import { noteTabKind } from "./noteTabKind";
import { noteSurface } from "./noteSurface";
import { projectViews } from "@/features/projects/ui";
import { chatSideAdds } from "@/features/chatPanel/ui";
import { notesChatSideAdd, notesView } from "./projectViews";
import { settingsItems } from "@/features/settings/ui";
import { noteDirItem } from "./settings/settingsItems";

export const contributes = [
  panelTabs.item(noteTabKind),
  panelSurfaces.item(noteSurface),
  openTargets.item(noteTarget),
  openTargets.item(noteFromVisualTarget),
  projectViews.item(notesView),
  chatSideAdds.item(notesChatSideAdd),
  // 発言の右クリックの「ノート」の項目と、会話の文を選んだときの「ノート ▾」
  messageActions.item({ kind: "menu", id: "notes.menu", order: 10, Items: lazyPart<MessageMenuContext>(() => import("./NoteMenuItems").then((m) => ({ default: m.NoteMenuItems }))) }),
  messageActions.item({ kind: "selection", id: "notes.selection", order: 10, Button: lazyPart<SelectionContext>(() => import("./SelectionNoteButton").then((m) => ({ default: m.SelectionNoteButton }))) }),
  // プロジェクトの設定の基本情報の「ノートフォルダ」
  settingsItems.item(noteDirItem),
  // 入力欄の上のノートのピル
  composerSlots.item({ kind: "pill", id: "notes", order: 10, load: () => import("./NoteChip").then((m) => m.ComposerNotePill) }),
];

// notes が拡張点に出すもの（app/renderer/registry.ts が入れる）
import { openTargets } from "@/foundation/ui/navigation/open";
import { lazyPart } from "@/foundation/ui/points";
import { messageActions, type MessageMenuContext, type SelectionContext } from "@/features/conversation/ui";
import { composerSlots } from "@/features/composer/ui";
import { panelSurfaces, panelTabs } from "@/features/panel/ui";
import { noteFromVisualTarget, noteTarget } from "./openTargets";
import { noteTabKind } from "./noteTabKind";
import { noteSurface } from "./noteSurface";

export const contributes = [
  panelTabs.item(noteTabKind),
  panelSurfaces.item(noteSurface),
  openTargets.item(noteTarget),
  openTargets.item(noteFromVisualTarget),
  // 発言の右クリックの「ノート」の項目と、会話の文を選んだときの「ノート ▾」
  messageActions.item({ kind: "menu", id: "notes.menu", order: 10, Items: lazyPart<MessageMenuContext>(() => import("./NoteMenuItems").then((m) => ({ default: m.NoteMenuItems }))) }),
  messageActions.item({ kind: "selection", id: "notes.selection", order: 10, Button: lazyPart<SelectionContext>(() => import("./SelectionNoteButton").then((m) => ({ default: m.SelectionNoteButton }))) }),
  // 入力欄の上のノートのピル
  composerSlots.item({ kind: "pill", id: "notes", order: 10, load: () => import("./NoteChip").then((m) => m.ComposerNotePill) }),
];

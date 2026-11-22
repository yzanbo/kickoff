// notes が拡張点に出すもの（app/renderer/registry.ts が入れる）
import { openTargets } from "@/foundation/ui/navigation/open";
import { lazyPart } from "@/foundation/ui/points";
import { messageActions, type MessageMenuContext, type SelectionContext } from "@/features/conversation/ui";
import { noteTarget } from "./openTargets";

export const contributes = [
  openTargets.item(noteTarget),
  // 発言の右クリックの「ノート」の項目と、会話の文を選んだときの「ノート ▾」
  messageActions.item({ kind: "menu", id: "notes.menu", order: 10, Items: lazyPart<MessageMenuContext>(() => import("./NoteMenuItems").then((m) => ({ default: m.NoteMenuItems }))) }),
  messageActions.item({ kind: "selection", id: "notes.selection", order: 10, Button: lazyPart<SelectionContext>(() => import("./SelectionNoteButton").then((m) => ({ default: m.SelectionNoteButton }))) }),
];

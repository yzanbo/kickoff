// notes がアプリの根に置く物: ノートの保存・読み込みの様子と、別ウィンドウから頼まれたノートを開く受け手
import { useEffect } from "react";
import type { AppHost } from "@/foundation/ui/shell/points";
import { onWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { NoteProgress } from "./NoteProgress";
import { openNoteFromChat } from "./openNoteFrom";

/** 別ウィンドウ（チャット・ノートの「ノートで開く」）から頼まれたノートを、このウィンドウで開く */
function useNoteWindowMessages() {
  useEffect(() => onWindowMessage("openNote", (m) => openNoteFromChat(m)), []);
}

export const notesHosts: AppHost[] = [
  { id: "noteProgress", windows: "both", order: 130, Host: NoteProgress },
  { id: "notes.windowMessages", windows: "main", useEffect: useNoteWindowMessages },
];

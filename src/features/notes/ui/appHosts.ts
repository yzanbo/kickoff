// notes がアプリの根に置く物: 別ウィンドウから頼まれたノートを開く受け手
import { useEffect } from "react";
import type { AppHost } from "@/foundation/ui/shell/points";
import { onWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { openNoteFromChat } from "./openNote";

/** 別ウィンドウ（チャット・ノートの「ノートで開く」）から頼まれたノートを、このウィンドウで開く */
function useNoteWindowMessages() {
  useEffect(() => onWindowMessage("openNote", (m) => openNoteFromChat(m)), []);
}

export const notesHosts: AppHost[] = [
  { id: "notes.windowMessages", windows: "main", useEffect: useNoteWindowMessages },
];

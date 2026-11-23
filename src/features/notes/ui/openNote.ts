// ノートを開く口（open({ kind: "note" }) の行き先の中身。チャットから・ノートのタブで・別ウィンドウから頼まれたときの開き方を 1 か所で決める）。
// チャットからは設定の開き方（storage.settings.openIn）で: 別ウィンドウ / 送る前の新しいチャット（draftSide）ならその下書きのタブの右の欄 /
// 別ウィンドウの中ならメインのウィンドウに頼む / ノートのチャットからならノートのタブ / そのチャット（子チャットなら、いちばん上の親）の右の欄 / だめならノートのタブ
import { canPopout, openPopout, parsePopout } from "@/foundation/ui/navigation/popout";
import { baseName } from "@shared/foundation/path";
import { navigate } from "@/foundation/ui/navigation/router";
import { postToMainWindow } from "@/foundation/ui/navigation/windowBus";
import { storage } from "./storage";
import { readSetting } from "@/foundation/ui/storage";
import { chatSidePanel, knownChat, openInRootSide } from "@/features/chat/ui";
import { trySideOpen } from "@/features/projects/ui";
import { noteTab, openTab, type DraftScope } from "@/features/panel/ui";

/** チャットからノートを開く先（noteOpenWay が決める。rootSide に置けなければノートのタブ） */
export type NoteOpenWay = "window" | "draftSide" | "mainWindow" | "rootSide" | "noteTab";

/** チャットからノートを開く先を決める（純粋。上から順に当てはまるもの） */
export function noteOpenWay(at: {
  /** 開き方（頼んだ場所。なければ設定） */
  place: "side" | "window";
  canPopout: boolean;
  chatId: number | null;
  hasDraftSide: boolean;
  inPopout: boolean;
  /** 頼んだチャットがノートのチャット（ノートのタブの中で開いたもの。右の欄を持たない） */
  fromNoteChat: boolean;
}): NoteOpenWay {
  if (at.place === "window" && at.canPopout) return "window";
  if (at.chatId === null && at.hasDraftSide) return "draftSide";
  if (at.inPopout) return "mainWindow";
  if (at.chatId === null || at.fromNoteChat) return "noteTab";
  return "rootSide";
}

/** このウィンドウのノートのタブ（右サイドバーがノートを見せていればそこ）で開く。line はそのノートで移る行 */
export function showInNoteTab(projectId: number, path: string, { line, replace }: { line?: number; replace?: boolean } = {}) {
  if (trySideOpen(projectId, { kind: "note", path, ...(line ? { line } : {}) })) return;
  navigate({ name: "project", id: projectId, tab: "notes", note: path, ...(line ? { noteLine: line } : {}) }, { replace });
}

/** ノートのタブでそのノートを開く（DB クライアントの手順ノートのタブの「ノートのタブで開く」。別ウィンドウの中からはメインのウィンドウに頼む） */
export function openInNoteTab(projectId: number, path: string) {
  if (parsePopout(location.hash)) return postToMainWindow("openNote", { projectId, path, chatId: null });
  showInNoteTab(projectId, path);
}

export function openNoteFromChat({
  projectId,
  path,
  chatId,
  place,
  draftSide = null,
}: {
  projectId: number;
  path: string;
  chatId: number | null;
  /** 渡すと設定によらずその場所に（入力欄の上のノートの一覧の行のボタン・AI の open_note） */
  place?: "side" | "window";
  /** 送る前の新しいチャットの右の欄（DraftSideContext。チャットがまだないので、そのタブの右の欄に開く） */
  draftSide?: DraftScope | null;
}) {
  const way = noteOpenWay({
    place: place ?? readSetting(storage.settings.openIn),
    canPopout: canPopout(),
    chatId,
    hasDraftSide: draftSide !== null,
    inPopout: Boolean(parsePopout(location.hash)),
    fromNoteChat: chatId !== null && Boolean(knownChat(chatId)?.note_path),
  });
  if (way === "window") return openPopout({ kind: "note", projectId, path, ...(chatId !== null ? { chatId } : {}) }, `${baseName(path)} — ノート`);
  if (way === "draftSide" && draftSide) return openTab(chatSidePanel(draftSide), noteTab({ chatId: null, projectId, path }));
  if (way === "mainWindow") return postToMainWindow("openNote", { projectId, path, chatId });
  if (way === "rootSide" && chatId !== null && openInRootSide(chatId, (rootId, side) => openTab(side, noteTab({ chatId: rootId, projectId, path })))) return;
  showInNoteTab(projectId, path);
}

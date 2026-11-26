// ノートを開く口（open({ kind: "note" }) の行き先の中身。チャットから・ノートのタブで・別ウィンドウから頼まれたときの開き方を 1 か所で決める）。
// チャットからは設定の開き方（storage.settings.openIn）で: 別ウィンドウ / 送る前の新しいチャット（draftSide）ならその下書きのタブの右の欄 /
// 別ウィンドウの中ならメインのウィンドウに頼む / ノートのチャットからならノートのタブ / そのチャット（子チャットなら、いちばん上の親）の右の欄 / だめならノートのタブ
import { canPopout, openPopout, parsePopout } from "@/foundation/ui/navigation/popout";
import { baseName } from "@shared/foundation/path";
import { navigate, parse, routeProjectId } from "@/foundation/ui/navigation/router";
import { setFold } from "@/foundation/ui/hooks/useFold";
import { postToMainWindow } from "@/foundation/ui/navigation/windowBus";
import { storage } from "./storage";
import { readSetting } from "@/foundation/ui/storage";
import { chatSidePanel, knownChat, openInRootSide } from "@/features/chat/ui";
import { isCommonProjectId, isSideViewShown, trySideOpen } from "@/features/projects/ui";
import { noteTab, openTab, sidePanelsHandedOut, type DraftScope } from "@/features/panel/ui";
import { screenProjectFor } from "./commonNotes";
import { ALL_NOTES_PANEL_KEY, notePanelKey, openNoteInPanel, sideNoteScope } from "./notePanel";
import { ALL_NOTES_FOLD_PLACE, allNotesFoldKey } from "./allNotes/allNotesModel";
import { requestNoteReveal } from "./noteReveal";
import { revealNoteFolders } from "./tree/useNoteFolders";

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

/** チャットからでなくノートを開く先（noteShowPlace が決める） */
export type NoteShowPlace = "allNotes" | "project" | "host";

/**
 * チャットからでなくノートを開く先（純粋）: 全ノートの画面を見ていれば、どのノートもその画面の中（画面を移ると、見ていた一覧から離れて迷うため）。
 * ふつうのプロジェクトのノートはそのプロジェクトのノートのタブ（project）。見えないプロジェクト（共通のノート）はその画面がないので、
 * プロジェクトを見ていればそのノートのタブ（host）、見ていなければ（全プロジェクトの画面）全ノートの画面
 */
export function noteShowPlace(viewing: "allNotes" | "project" | "none", hidden: boolean): NoteShowPlace {
  if (viewing === "allNotes") return "allNotes";
  if (!hidden) return "project";
  return viewing === "project" ? "host" : "allNotes";
}

/** いま見ている画面の種類（noteShowPlace に渡す形） */
function viewing(): "allNotes" | "project" | "none" {
  const route = parse(location.hash);
  if (route.name === "allNotes") return "allNotes";
  return routeProjectId(route) === null ? "none" : "project";
}

/** このウィンドウのノートのタブ（右サイドバーがノートを見せていればそこ・全ノートの画面ならその中）で開く。line はそのノートで移る行 */
export function showInNoteTab(projectId: number, path: string, { line, replace }: { line?: number; replace?: boolean } = {}) {
  const hidden = isCommonProjectId(projectId);
  const place = noteShowPlace(viewing(), hidden);
  if (place === "allNotes") return showInAllNotes(projectId, path, hidden, { line, replace });
  if (place === "host") return showHiddenProjectNote(projectId, path, { line, replace });
  if (trySideOpen(projectId, { kind: "note", path, ...(line ? { line } : {}) })) return;
  navigate({ name: "project", id: projectId, tab: "notes", note: path, ...(line ? { noteLine: line } : {}) }, { replace });
}

/**
 * 見えないプロジェクト（共通のノート）のノートを、いま見ているプロジェクトのノートのタブ（右サイドバーがノートを見せていればそこ）に、
 * 見えないプロジェクトのノートのタブとして開く。URL の ?note= はそのプロジェクトのノートを指すので使わず、右のタブの欄に直に開いてから画面を移る
 * （右サイドバーの頼み trySideOpen と同じく、右サイドバーを別ウィンドウへ移しているときは真ん中）。見ているプロジェクトがもうなければ全ノートの画面
 */
function showHiddenProjectNote(projectId: number, path: string, { line, replace }: { line?: number; replace?: boolean }) {
  const host = screenProjectFor(projectId);
  if (host === undefined) return showInAllNotes(projectId, path, true, { line, replace });
  if (line) requestNoteReveal(projectId, path, line);
  const side = !sidePanelsHandedOut() && isSideViewShown(host, "notes");
  void openNoteInPanel(projectId, path, true, notePanelKey(host, side ? sideNoteScope(host) : undefined));
  revealNoteFolders(projectId, path);
  if (!side) navigate({ name: "project", id: host, tab: "notes" }, { replace });
}

/** 全ノートの画面で開く（入った欄を開いてから右のタブの欄に直に開き、まだ見ていなければ画面を移る） */
function showInAllNotes(projectId: number, path: string, hidden: boolean, { line, replace }: { line?: number; replace?: boolean }) {
  if (line) requestNoteReveal(projectId, path, line);
  setFold(ALL_NOTES_FOLD_PLACE, allNotesFoldKey(projectId, hidden), true);
  void openNoteInPanel(projectId, path, true, ALL_NOTES_PANEL_KEY);
  revealNoteFolders(projectId, path);
  if (parse(location.hash).name !== "allNotes") navigate({ name: "allNotes" }, { replace });
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

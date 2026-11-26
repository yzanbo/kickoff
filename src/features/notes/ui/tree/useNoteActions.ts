import { TRASH_KEEP_DAYS } from "@shared/trash/types";
import { NOTE_KIND_EXTENSIONS, noteExtensionOf, newHtmlNote, type NoteKind } from "@shared/notes/kinds";
import { datedNoteName, safeNoteName } from "@shared/notes/names";
import { notesApi } from "@/features/notes/ui/api";
import { runEach } from "./runEach";
import { errorMessage } from "@shared/foundation/errors";
import { notesStore } from "@/features/notes/ui/store";
import { alert, confirm, reportFailure } from "@/foundation/ui/kit/ask";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "@/features/notes/ui/storage";
import { ancestorsOf, baseName, isUnder, joinPath, remapPrefix } from "@shared/foundation/path";
import { noteTitle, parentOf, pathTaken, renamedPath, untitledPath } from "@/features/notes/ui/notePaths";
import { showTrashedManyToast, showTrashedToast } from "@/features/trash/ui";
import { topLevelPaths } from "@/foundation/ui/kit/list/treeModel";
import { movedNoteTab } from "@/features/notes/ui/notePanel";
import { mapTabs } from "@/features/panel/ui";
import { postWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { foldersAfterTransfer } from "./noteMoveModel";
import { isCommonProjectId } from "@/features/projects/ui";

/** 新しく作るノート・フォルダの仮の名前（作ったらすぐ一覧で名前を変えてもらう。Finder の「名称未設定フォルダ」と同じ）。ノートは頭に作った日の日付を付ける（datedNoteName） */
const UNTITLED_NOTE = "無題のノート";
const UNTITLED_FOLDER = "名称未設定フォルダ";

/** 一覧で名前を変えた結果（taken: 同じ名前があったので、書いた名前のまま書き直してもらう） */
export type NoteRenameResult = "done" | "taken";

/**
 * ノートのタブの操作（新しいノート・フォルダ・名前の変更・動かす・ゴミ箱）。新しいノート・フォルダは Finder と同じく、仮の名前ですぐ作り、
 * 一覧のその行で名前を変えてもらう（onCreated。ダイアログで聞かない）。名前の変更も一覧の行で書く（renameTo。ファイル名に使えない文字はそろえ、
 * 書いた名前がそのままファイル名になる。同じフォルダに同じ名前があれば、番号を付けずに知らせて書き直してもらう。拡張子が違えば同じ題名でも作れる）。
 * 終わったら一覧を取り直し（知らせを待たない）、開いているノート・フォルダを付いていかせる（onMoved）。失敗はお知らせで出す
 */
/** ゴミ箱に入れる前の確かめの、戻せる期間と場所（共通のノートはプロジェクトの「ゴミ箱」タブがないので、欄の「…」から開く） */
function trashNotice(projectId: number): string {
  const where = isCommonProjectId(projectId) ? "共通のノートの欄の「…」の「ゴミ箱を開く」" : "プロジェクトの「ゴミ箱」";
  return `Kickoff のゴミ箱に ${TRASH_KEEP_DAYS} 日入り、その間は${where}から戻せます。`;
}

export function useNoteActions(
  projectId: number,
  {
    onCreated,
    onMoved,
    onTrashed,
    beforeChange,
  }: {
    /** 作った（ノートは開く・フォルダは開いて、どちらも一覧の行で名前を変え始める） */
    onCreated?: (path: string, dir: boolean) => void;
    /** 名前を変えた・動かした（開いているノート・フォルダのパスを付け替える） */
    onMoved: (from: string, to: string) => void;
    onTrashed?: (path: string) => void;
    /** 名前を変える・動かす・ゴミ箱に入れる前（開いているノートにかかるなら、まだ保存していない書きかけをどうするか聞く。やめたら false） */
    beforeChange: (path: string) => Promise<boolean>;
  },
) {
  const refresh = () => notesStore.invalidate(projectId);
  const entries = () => notesStore.get(projectId).data?.entries ?? [];

  /** 新しいノート（HTML なら、題名の見出しと <style> の入ったひな形から始める）。仮の名前「2026-11-09 無題のノート」（作った日の日付を頭に）ですぐ作る */
  const createNote = async (folder: string, kind: NoteKind = "markdown") => {
    const html = kind === "html";
    const path = untitledPath(entries(), folder, datedNoteName(UNTITLED_NOTE, new Date()), NOTE_KIND_EXTENSIONS[kind]);
    await notesApi("POST /api/projects/:projectId/notes", { params: { projectId }, body: { path, ...(html ? { content: newHtmlNote(noteTitle(path)) } : {}) } }).then(() => {
      refresh();
      onCreated?.(path, false);
    }, reportFailure("ノートを作れませんでした"));
  };

  const createFolder = async (folder: string) => {
    const path = untitledPath(entries(), folder, UNTITLED_FOLDER);
    await notesApi("POST /api/projects/:projectId/notes", { params: { projectId }, body: { path, dir: true } }).then(() => {
      refresh();
      onCreated?.(path, true);
    }, reportFailure("フォルダを作れませんでした"));
  };

  const move = async (from: string, to: string) => {
    if (from === to || !(await beforeChange(from))) return;
    await notesApi("POST /api/projects/:projectId/notes/move", { params: { projectId }, body: { from, to } }).then(() => {
      refresh();
      onMoved(from, to);
    }, reportFailure("動かせませんでした"));
  };

  /** HTML のノートが作ったときのひな形のままなら、ひな形の題名（<title> と見出し）も新しい名前にする（できなければそのまま） */
  const retitleHtml = async (from: string, to: string) => {
    if (noteExtensionOf(to) !== NOTE_KIND_EXTENSIONS.html) return;
    try {
      const file = await notesApi("GET /api/projects/:projectId/note", { params: { projectId }, query: { path: to } });
      if (file.content === newHtmlNote(noteTitle(from))) await notesApi("PUT /api/projects/:projectId/note", { params: { projectId }, body: { path: to, content: newHtmlNote(noteTitle(to)), base_hash: file.hash } });
    } catch {
      // 題名を付け直せなくても、名前の変更はできている
    }
  };

  /** 一覧の行で書いた名前に変える（ノートは元の拡張子を付け直す）。同じ名前があれば知らせて "taken"（書き直してもらう） */
  const renameTo = async (path: string, dir: boolean, typed: string): Promise<NoteRenameResult> => {
    const to = renamedPath(path, dir, safeNoteName(typed));
    if (to === path) return "done";
    if (pathTaken(entries(), to, path)) {
      const where = parentOf(to) ? `「${parentOf(to)}」に` : "";
      const hint = noteExtensionOf(to) ? "拡張子が違うノート（Markdown と HTML）なら、同じ名前でも作れます。" : "";
      await alert("同じ名前があります", `${where}「${baseName(to)}」がもうあります。別の名前にしてください。${hint}`);
      return "taken";
    }
    if (!(await beforeChange(path))) return "done";
    await notesApi("POST /api/projects/:projectId/notes/move", { params: { projectId }, body: { from: path, to } }).then(async () => {
      await retitleHtml(path, to);
      refresh();
      onMoved(path, to);
    }, reportFailure("名前を変更できませんでした"));
    return "done";
  };

  /** フォルダ（folder。"" は直下）へ動かす（同じ場所・自分の中へは動かさない） */
  const moveInto = async (path: string, folder: string) => {
    if (parentOf(path) === folder || folder === path || folder.startsWith(`${path}/`)) return;
    await move(path, joinPath(folder, baseName(path)));
  };

  const trash = async (path: string, dir: boolean) => {
    const ok = await confirm({
      title: dir ? `フォルダ「${baseName(path)}」をゴミ箱に入れますか？` : `「${baseName(path)}」をゴミ箱に入れますか？`,
      message: `${dir ? "中のノートもすべてゴミ箱に入ります。" : ""}${trashNotice(projectId)}`,
      confirmLabel: "ゴミ箱に入れる",
      danger: true,
    });
    if (!ok || !(await beforeChange(path))) return;
    await notesApi("DELETE /api/projects/:projectId/note", { params: { projectId }, query: { path } }).then(({ trash_id }) => {
      refresh();
      onTrashed?.(path);
      showTrashedToast(trash_id, baseName(path));
    }, reportFailure("ゴミ箱に入れられませんでした"));
  };

  /**
   * いくつかのノートをまとめて動かす（AI のフォルダの整理案）。1 件ずつ順に動かし、失敗したものは飛ばして最後にまとめて返す。
   * 開いているノートの書きかけは、ほかの操作と同じく動かす前に聞く（やめたものは動かさない）
   */
  const moveMany = async (moves: readonly { from: string; to: string }[]) => {
    const { done, failed } = await runEach(moves, async (m) => {
      if (!(await beforeChange(m.from))) return false;
      await notesApi("POST /api/projects/:projectId/notes/move", { params: { projectId }, body: { from: m.from, to: m.to } });
      onMoved(m.from, m.to);
      return true;
    });
    refresh();
    return { moved: done.length, failed: failed.map(({ item, error }) => `${item.from}: ${errorMessage(error)}`) };
  };

  /** 失敗したものを最後にまとめて知らせる（まとめて動かす・ゴミ箱に入れる） */
  const reportMany = async (title: string, failed: readonly string[]) => {
    if (failed.length > 0) await alert(title, failed.join("\n"));
  };

  /**
   * 一覧で選んだいくつかのノート・フォルダを、フォルダ（"" は直下）へまとめて動かす（ドラッグ）。1 つなら moveInto と同じ。
   * 同じ場所・自分の中へは動かさず、同じ名前があるものは飛ばして最後にまとめて知らせる
   */
  const moveAllInto = async (paths: readonly string[], folder: string) => {
    const targets = topLevelPaths(paths).filter((p) => parentOf(p) !== folder && folder !== p && !folder.startsWith(`${p}/`));
    if (targets.length <= 1) {
      if (targets[0] !== undefined) await moveInto(targets[0], folder);
      return;
    }
    // 同じ名前があるものは飛ばして、最後にまとめて知らせる
    const { failed } = await runEach(targets, async (from) => {
      const to = joinPath(folder, baseName(from));
      if (pathTaken(entries(), to, from)) throw new Error(`「${folder || "いちばん上"}」に同じ名前があります`);
      if (!(await beforeChange(from))) return false;
      await notesApi("POST /api/projects/:projectId/notes/move", { params: { projectId }, body: { from, to } });
      onMoved(from, to);
      return true;
    });
    refresh();
    await reportMany("動かせなかったものがあります", failed.map(({ item, error }) => `${baseName(item)}: ${errorMessage(error)}`));
  };

  /** 一覧で選んだいくつかのノート・フォルダを、1 回だけ確かめてからまとめてゴミ箱に入れる（1 つなら trash と同じ） */
  const trashMany = async (nodes: readonly { path: string; dir: boolean }[]) => {
    const tops = new Set(topLevelPaths(nodes.map((n) => n.path)));
    const targets = nodes.filter((n) => tops.has(n.path));
    if (targets.length <= 1) {
      if (targets[0]) await trash(targets[0].path, targets[0].dir);
      return;
    }
    const names = targets.slice(0, 10).map((n) => `・${baseName(n.path)}${n.dir ? "（フォルダ）" : ""}`);
    if (targets.length > names.length) names.push(`ほか ${targets.length - names.length} 件`);
    const ok = await confirm({
      title: `${targets.length} 件をゴミ箱に入れますか？`,
      message: `${names.join("\n")}\n\n${targets.some((n) => n.dir) ? "フォルダの中のノートもすべてゴミ箱に入ります。" : ""}${trashNotice(projectId)}`,
      confirmLabel: "ゴミ箱に入れる",
      danger: true,
    });
    if (!ok) return;
    const trashed: { id: string; label: string }[] = [];
    const { failed } = await runEach(targets, async ({ path }) => {
      if (!(await beforeChange(path))) return false;
      const { trash_id } = await notesApi("DELETE /api/projects/:projectId/note", { params: { projectId }, query: { path } });
      trashed.push({ id: trash_id, label: baseName(path) });
      onTrashed?.(path);
      return true;
    });
    refresh();
    // 入れたものは「元に戻す」でまとめて戻せる（1 件だけなら 1 件のときと同じ知らせ）
    if (trashed.length === 1 && trashed[0]) showTrashedToast(trashed[0].id, trashed[0].label);
    else if (trashed.length > 1) showTrashedManyToast(trashed);
    await reportMany("ゴミ箱に入れられなかったものがあります", failed.map(({ item, error }) => `${baseName(item.path)}: ${errorMessage(error)}`));
  };

  return { createNote, createFolder, renameTo, moveInto, moveAllInto, moveMany, trash, trashMany };
}

/**
 * 名前を変えた・動かしたあとに、プロジェクトごとに覚えている「ノートのタブで選んでいるノート」と「開いているフォルダ」を付け替え、動かした先を見せるよう親のフォルダを開く
 * （ノートのタブと入力欄の上の「ノート」の木で共通。どちらも同じ覚えを読む）。まとめて動かすと続けて呼ばれるので、いま覚えている値から付け替える（前の付け替えを上書きしないように）。
 * toProjectId は欄の間で動かしたときの行き先（元の欄の覚えからは外し、行き先の欄に移す）。開いているタブと、ほかのウィンドウで開いているノートも付け替える
 */
export function followMovedNote(projectId: number, from: string, to: string, toProjectId = projectId) {
  const selected = readSetting(storage.settings.selected(projectId));
  const fromFolders = readSetting(storage.settings.openFolders(projectId));
  if (toProjectId === projectId) {
    if (selected) writeSetting(storage.settings.selected(projectId), remapPrefix(selected, from, to));
    writeSetting(storage.settings.openFolders(projectId), [...new Set([...fromFolders.map((p) => remapPrefix(p, from, to)), ...ancestorsOf(to)])]);
  } else {
    if (selected && isUnder(selected, from)) writeSetting(storage.settings.selected(projectId), "");
    const folders = foldersAfterTransfer(fromFolders, readSetting(storage.settings.openFolders(toProjectId)), from, to);
    writeSetting(storage.settings.openFolders(projectId), folders.from);
    writeSetting(storage.settings.openFolders(toProjectId), folders.to);
  }
  // 開いているタブも付け替える（ノートのタブの右・右サイドバー・チャットの右の欄）
  mapTabs("note", movedNoteTab(projectId, from, to, toProjectId));
  postWindowMessage("noteMoved", { projectId, from, toProjectId, to });
}

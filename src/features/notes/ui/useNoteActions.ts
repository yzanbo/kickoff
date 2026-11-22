import { NOTE_KIND_EXTENSIONS, noteExtensionOf, newHtmlNote, type NoteKind } from "@shared/notes/kinds";
import { datedNoteName, safeNoteName } from "@shared/notes/names";
import { api } from "@/foundation/ui/api";
import { errorMessage } from "@shared/foundation/errors";
import { notesStore } from "@/features/notes/ui/stores/notes";
import { alert, confirm, reportFailure } from "@/foundation/ui/kit/ask";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "./storage";
import { remapPrefix } from "@shared/foundation/path";
import { ancestorsOf, baseName, joinNotePath, noteTitle, parentOf, pathTaken, renamedPath, untitledPath } from "./notePaths";
import { showTrashedToast } from "@/features/trash/ui/trashActions";
import { topLevelPaths } from "@/foundation/ui/kit/list/treeModel";
import { movedNoteTab } from "./notePanel";
import { mapTabs } from "@/features/panel/ui";

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
    await api.createNote(projectId, path, html ? { content: newHtmlNote(noteTitle(path)) } : {}).then(() => {
      refresh();
      onCreated?.(path, false);
    }, reportFailure("ノートを作れませんでした"));
  };

  const createFolder = async (folder: string) => {
    const path = untitledPath(entries(), folder, UNTITLED_FOLDER);
    await api.createNote(projectId, path, { dir: true }).then(() => {
      refresh();
      onCreated?.(path, true);
    }, reportFailure("フォルダを作れませんでした"));
  };

  const move = async (from: string, to: string) => {
    if (from === to || !(await beforeChange(from))) return;
    await api.moveNote(projectId, from, to).then(() => {
      refresh();
      onMoved(from, to);
    }, reportFailure("動かせませんでした"));
  };

  /** HTML のノートが作ったときのひな形のままなら、ひな形の題名（<title> と見出し）も新しい名前にする（できなければそのまま） */
  const retitleHtml = async (from: string, to: string) => {
    if (noteExtensionOf(to) !== NOTE_KIND_EXTENSIONS.html) return;
    try {
      const file = await api.note(projectId, to);
      if (file.content === newHtmlNote(noteTitle(from))) await api.saveNote(projectId, to, newHtmlNote(noteTitle(to)), file.hash);
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
    await api.moveNote(projectId, path, to).then(async () => {
      await retitleHtml(path, to);
      refresh();
      onMoved(path, to);
    }, reportFailure("名前を変更できませんでした"));
    return "done";
  };

  /** フォルダ（folder。"" は直下）へ動かす（同じ場所・自分の中へは動かさない） */
  const moveInto = async (path: string, folder: string) => {
    if (parentOf(path) === folder || folder === path || folder.startsWith(`${path}/`)) return;
    await move(path, joinNotePath(folder, baseName(path)));
  };

  const trash = async (path: string, dir: boolean) => {
    const ok = await confirm({
      title: dir ? `フォルダ「${baseName(path)}」をゴミ箱に入れますか？` : `「${baseName(path)}」をゴミ箱に入れますか？`,
      message: dir ? "中のノートもすべてゴミ箱に入ります。Kickoff のゴミ箱に 3 日入り、その間はプロジェクトの「ゴミ箱」から戻せます。" : "Kickoff のゴミ箱に 3 日入り、その間はプロジェクトの「ゴミ箱」から戻せます。",
      confirmLabel: "ゴミ箱に入れる",
      danger: true,
    });
    if (!ok || !(await beforeChange(path))) return;
    await api.trashNote(projectId, path).then(({ trash_id }) => {
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
    const failed: string[] = [];
    let moved = 0;
    for (const m of moves) {
      if (!(await beforeChange(m.from))) continue;
      try {
        await api.moveNote(projectId, m.from, m.to);
        onMoved(m.from, m.to);
        moved++;
      } catch (e) {
        failed.push(`${m.from}: ${errorMessage(e)}`);
      }
    }
    refresh();
    return { moved, failed };
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
    const failed: string[] = [];
    for (const from of targets) {
      const to = joinNotePath(folder, baseName(from));
      if (pathTaken(entries(), to, from)) {
        failed.push(`${baseName(from)}: 「${folder || "いちばん上"}」に同じ名前があります`);
        continue;
      }
      if (!(await beforeChange(from))) continue;
      try {
        await api.moveNote(projectId, from, to);
        onMoved(from, to);
      } catch (e) {
        failed.push(`${baseName(from)}: ${errorMessage(e)}`);
      }
    }
    refresh();
    await reportMany("動かせなかったものがあります", failed);
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
      message: `${names.join("\n")}\n\n${targets.some((n) => n.dir) ? "フォルダの中のノートもすべてゴミ箱に入ります。" : ""}Kickoff のゴミ箱に 3 日入り、その間はプロジェクトの「ゴミ箱」から戻せます。`,
      confirmLabel: "ゴミ箱に入れる",
      danger: true,
    });
    if (!ok) return;
    const failed: string[] = [];
    for (const { path } of targets) {
      if (!(await beforeChange(path))) continue;
      try {
        await api.trashNote(projectId, path);
        onTrashed?.(path);
      } catch (e) {
        failed.push(`${baseName(path)}: ${errorMessage(e)}`);
      }
    }
    refresh();
    await reportMany("ゴミ箱に入れられなかったものがあります", failed);
  };

  return { createNote, createFolder, renameTo, moveInto, moveAllInto, moveMany, trash, trashMany };
}

/**
 * 名前を変えた・動かしたあとに、プロジェクトごとに覚えている「ノートのタブで選んでいるノート」と「開いているフォルダ」を付け替え、動かした先を見せるよう親のフォルダを開く
 * （ノートのタブと入力欄の上の「ノート」の木で共通。どちらも同じ覚えを読む）。まとめて動かすと続けて呼ばれるので、いま覚えている値から付け替える（前の付け替えを上書きしないように）
 */
export function followMovedNote(projectId: number, from: string, to: string) {
  const selected = readSetting(storage.settings.selected(projectId));
  if (selected) writeSetting(storage.settings.selected(projectId), remapPrefix(selected, from, to));
  writeSetting(storage.settings.openFolders(projectId), [...new Set([...remapPaths(readSetting(storage.settings.openFolders(projectId)), from, to), ...ancestorsOf(to)])]);
  // 開いているタブも付け替える（ノートのタブの右・右サイドバー・チャットの右の欄）
  mapTabs("note", movedNoteTab(projectId, from, to));
}

/** 動かしたあとに、覚えているパスの組を付け替える（開いているフォルダ） */
function remapPaths(paths: readonly string[], from: string, to: string): string[] {
  return paths.map((p) => remapPrefix(p, from, to));
}

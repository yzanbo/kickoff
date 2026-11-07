import { MEMO_KIND_EXTENSIONS, memoExtensionOf, newHtmlMemo, type MemoKind } from "@shared/memo/kinds";
import { safeMemoName } from "@shared/memo/names";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { memosStore } from "@/stores/memos";
import { alertDialog, confirmDialog, reportFailure } from "@/ui/dialogs";
import { readSetting, writeSetting } from "@/lib/storage";
import { memoOpenFolders, memoSelected } from "@/lib/storageKeys";
import { ancestorsOf, baseName, joinMemoPath, memoTitle, parentOf, pathTaken, remapPath, renamedPath, untitledPath } from "./memoPaths";
import { remapMemoTabs } from "./memoPanel";

/** 新しく作るメモ・フォルダの仮の名前（作ったらすぐ一覧で名前を変えてもらう。Finder の「名称未設定フォルダ」と同じ） */
const UNTITLED_MEMO = "無題のメモ";
const UNTITLED_FOLDER = "名称未設定フォルダ";

/** 一覧で名前を変えた結果（taken: 同じ名前があったので、書いた名前のまま書き直してもらう） */
export type MemoRenameResult = "done" | "taken";

/**
 * メモのタブの操作（新しいメモ・フォルダ・名前の変更・動かす・ゴミ箱）。新しいメモ・フォルダは Finder と同じく、仮の名前ですぐ作り、
 * 一覧のその行で名前を変えてもらう（onCreated。ダイアログで聞かない）。名前の変更も一覧の行で書く（renameTo。ファイル名に使えない文字はそろえ、
 * 書いた名前がそのままファイル名になる。同じフォルダに同じ名前があれば、番号を付けずに知らせて書き直してもらう。拡張子が違えば同じ題名でも作れる）。
 * 終わったら一覧を取り直し（知らせを待たない）、開いているメモ・フォルダを付いていかせる（onMoved）。失敗はお知らせで出す
 */
export function useMemoActions(
  projectId: number,
  {
    onCreated,
    onMoved,
    onTrashed,
    beforeChange,
  }: {
    /** 作った（メモは開く・フォルダは開いて、どちらも一覧の行で名前を変え始める） */
    onCreated?: (path: string, dir: boolean) => void;
    /** 名前を変えた・動かした（開いているメモ・フォルダのパスを付け替える） */
    onMoved: (from: string, to: string) => void;
    onTrashed?: (path: string) => void;
    /** 名前を変える・動かす・ゴミ箱に入れる前（開いているメモにかかるなら、まだ保存していない書きかけをどうするか聞く。やめたら false） */
    beforeChange: (path: string) => Promise<boolean>;
  },
) {
  const refresh = () => memosStore.invalidate(projectId);
  const entries = () => memosStore.get(projectId).data?.entries ?? [];

  /** 新しいメモ（HTML なら、題名の見出しと <style> の入ったひな形から始める）。仮の名前ですぐ作る */
  const createMemo = async (folder: string, kind: MemoKind = "markdown") => {
    const html = kind === "html";
    const path = untitledPath(entries(), folder, UNTITLED_MEMO, MEMO_KIND_EXTENSIONS[kind]);
    await api.createMemo(projectId, path, html ? { content: newHtmlMemo(memoTitle(path)) } : {}).then(() => {
      refresh();
      onCreated?.(path, false);
    }, reportFailure("メモを作れませんでした"));
  };

  const createFolder = async (folder: string) => {
    const path = untitledPath(entries(), folder, UNTITLED_FOLDER);
    await api.createMemo(projectId, path, { dir: true }).then(() => {
      refresh();
      onCreated?.(path, true);
    }, reportFailure("フォルダを作れませんでした"));
  };

  const move = async (from: string, to: string) => {
    if (from === to || !(await beforeChange(from))) return;
    await api.moveMemo(projectId, from, to).then(() => {
      refresh();
      onMoved(from, to);
    }, reportFailure("動かせませんでした"));
  };

  /** HTML のメモが作ったときのひな形のままなら、ひな形の題名（<title> と見出し）も新しい名前にする（できなければそのまま） */
  const retitleHtml = async (from: string, to: string) => {
    if (memoExtensionOf(to) !== MEMO_KIND_EXTENSIONS.html) return;
    try {
      const file = await api.memo(projectId, to);
      if (file.content === newHtmlMemo(memoTitle(from))) await api.saveMemo(projectId, to, newHtmlMemo(memoTitle(to)), file.hash);
    } catch {
      // 題名を付け直せなくても、名前の変更はできている
    }
  };

  /** 一覧の行で書いた名前に変える（メモは元の拡張子を付け直す）。同じ名前があれば知らせて "taken"（書き直してもらう） */
  const renameTo = async (path: string, dir: boolean, typed: string): Promise<MemoRenameResult> => {
    const to = renamedPath(path, dir, safeMemoName(typed));
    if (to === path) return "done";
    if (pathTaken(entries(), to, path)) {
      const where = parentOf(to) ? `「${parentOf(to)}」に` : "";
      const hint = memoExtensionOf(to) ? "拡張子が違うメモ（Markdown と HTML）なら、同じ名前でも作れます。" : "";
      await alertDialog("同じ名前があります", `${where}「${baseName(to)}」がもうあります。別の名前にしてください。${hint}`);
      return "taken";
    }
    if (!(await beforeChange(path))) return "done";
    await api.moveMemo(projectId, path, to).then(async () => {
      await retitleHtml(path, to);
      refresh();
      onMoved(path, to);
    }, reportFailure("名前を変更できませんでした"));
    return "done";
  };

  /** フォルダ（folder。"" は直下）へ動かす（同じ場所・自分の中へは動かさない） */
  const moveInto = async (path: string, folder: string) => {
    if (parentOf(path) === folder || folder === path || folder.startsWith(`${path}/`)) return;
    await move(path, joinMemoPath(folder, baseName(path)));
  };

  const trash = async (path: string, dir: boolean) => {
    const ok = await confirmDialog({
      title: dir ? `フォルダ「${baseName(path)}」をゴミ箱に入れますか？` : `「${baseName(path)}」をゴミ箱に入れますか？`,
      message: dir ? "中のメモもすべてゴミ箱に入ります。Finder のゴミ箱から戻せます。" : "Finder のゴミ箱から戻せます。",
      confirmLabel: "ゴミ箱に入れる",
      danger: true,
    });
    if (!ok || !(await beforeChange(path))) return;
    await api.trashMemo(projectId, path).then(() => {
      refresh();
      onTrashed?.(path);
    }, reportFailure("ゴミ箱に入れられませんでした"));
  };

  /**
   * いくつかのメモをまとめて動かす（AI のフォルダの整理案）。1 件ずつ順に動かし、失敗したものは飛ばして最後にまとめて返す。
   * 開いているメモの書きかけは、ほかの操作と同じく動かす前に聞く（やめたものは動かさない）
   */
  const moveMany = async (moves: readonly { from: string; to: string }[]) => {
    const failed: string[] = [];
    let moved = 0;
    for (const m of moves) {
      if (!(await beforeChange(m.from))) continue;
      try {
        await api.moveMemo(projectId, m.from, m.to);
        onMoved(m.from, m.to);
        moved++;
      } catch (e) {
        failed.push(`${m.from}: ${errorMessage(e)}`);
      }
    }
    refresh();
    return { moved, failed };
  };

  return { createMemo, createFolder, renameTo, moveInto, moveMany, trash };
}

/**
 * 名前を変えた・動かしたあとに、プロジェクトごとに覚えている「メモのタブで選んでいるメモ」と「開いているフォルダ」を付け替え、動かした先を見せるよう親のフォルダを開く
 * （メモのタブと入力欄の上の「メモ」の木で共通。どちらも同じ覚えを読む）。まとめて動かすと続けて呼ばれるので、いま覚えている値から付け替える（前の付け替えを上書きしないように）
 */
export function followMovedMemo(projectId: number, from: string, to: string) {
  const selected = readSetting(memoSelected(projectId));
  if (selected) writeSetting(memoSelected(projectId), remapPath(selected, from, to));
  writeSetting(memoOpenFolders(projectId), [...new Set([...remapPaths(readSetting(memoOpenFolders(projectId)), from, to), ...ancestorsOf(to)])]);
  // メモのタブの右で開いているタブも付け替える
  remapMemoTabs(projectId, from, to);
}

/** 動かしたあとに、覚えているパスの組を付け替える（開いているフォルダ） */
export function remapPaths(paths: readonly string[], from: string, to: string): string[] {
  return paths.map((p) => remapPath(p, from, to));
}

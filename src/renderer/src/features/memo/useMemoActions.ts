import { MEMO_KIND_EXTENSIONS, memoExtensionOf, newHtmlMemo, type MemoKind } from "@shared/memo/kinds";
import { safeMemoName } from "@shared/memo/names";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { memosStore } from "@/stores/memos";
import { alertDialog, confirmDialog, promptDialog, reportFailure } from "@/ui/dialogs";
import { baseName, joinMemoPath, memoTitle, parentOf, pathTaken, remapPath, renamedPath } from "./memoPaths";

/**
 * メモのタブの操作（新しいメモ・フォルダ・名前の変更・動かす・ゴミ箱）。名前はダイアログで聞き、ファイル名に使えない文字はそろえる。
 * 書いた名前がそのままファイル名になる（同じフォルダに同じ名前があれば、番号を付けずに知らせて聞き直す。拡張子が違えば同じ題名でも作れる）。
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
    /** 作ったメモを開く・フォルダを開く */
    onCreated: (path: string, dir: boolean) => void;
    /** 名前を変えた・動かした（開いているメモ・フォルダのパスを付け替える） */
    onMoved: (from: string, to: string) => void;
    onTrashed: (path: string) => void;
    /** 名前を変える・動かす・ゴミ箱に入れる前（開いているメモにかかるなら、まだ保存していない書きかけをどうするか聞く。やめたら false） */
    beforeChange: (path: string) => Promise<boolean>;
  },
) {
  const refresh = () => memosStore.invalidate(projectId);
  /**
   * 名前を聞く（toPath で、そろえた名前からパスを作る）。同じフォルダに同じ名前（拡張子まで同じ）があれば知らせて、書いた名前のまま聞き直す。
   * except は名前を変える元。やめたら null（allowEmpty でなければ、空のときもやめる）
   */
  const askName = async (
    options: Parameters<typeof promptDialog>[0],
    toPath: (name: string) => string,
    { except, allowEmpty = false }: { except?: string; allowEmpty?: boolean } = {},
  ): Promise<{ name: string; path: string } | null> => {
    let initial = options.initial;
    for (;;) {
      const typed = await promptDialog({ ...options, initial });
      if (typed === null || (!allowEmpty && !typed.trim())) return null;
      const name = safeMemoName(typed);
      const path = toPath(name);
      if (!pathTaken(memosStore.get(projectId).data?.entries ?? [], path, except)) return { name, path };
      const where = parentOf(path) ? `「${parentOf(path)}」に` : "";
      const hint = memoExtensionOf(path) ? "拡張子が違うメモ（Markdown と HTML）なら、同じ名前でも作れます。" : "";
      await alertDialog("同じ名前があります", `${where}「${baseName(path)}」がもうあります。別の名前にしてください。${hint}`);
      initial = typed;
    }
  };

  /** 新しいメモ（HTML なら、題名の見出しと <style> の入ったひな形から始める） */
  const createMemo = async (folder: string, kind: MemoKind = "markdown") => {
    const html = kind === "html";
    const ext = MEMO_KIND_EXTENSIONS[kind];
    const asked = await askName(
      {
        title: html ? "新しい HTML メモ" : "新しいメモ",
        label: `名前（ファイル名。${ext} を付けて保存します）`,
        placeholder: "無題のメモ",
        confirmLabel: "作る",
        message: [folder ? `「${folder}」の中に作ります。` : "", html ? "HTML と CSS で書くページのメモです（.html）。メモのチャットに頼んで作ってもらうこともできます。" : ""].filter(Boolean).join("") || undefined,
      },
      (name) => joinMemoPath(folder, `${name}${ext}`),
      { allowEmpty: true },
    );
    if (!asked) return;
    const { name: title, path } = asked;
    await api.createMemo(projectId, path, html ? { content: newHtmlMemo(title) } : {}).then(() => {
      refresh();
      onCreated(path, false);
    }, reportFailure("メモを作れませんでした"));
  };

  const createFolder = async (folder: string) => {
    const asked = await askName({ title: "新しいフォルダ", label: "名前", confirmLabel: "作る", message: folder ? `「${folder}」の中に作ります。` : undefined }, (name) =>
      joinMemoPath(folder, name),
    );
    if (!asked) return;
    const { path } = asked;
    await api.createMemo(projectId, path, { dir: true }).then(() => {
      refresh();
      onCreated(path, true);
    }, reportFailure("フォルダを作れませんでした"));
  };

  const move = async (from: string, to: string) => {
    if (from === to || !(await beforeChange(from))) return;
    await api.moveMemo(projectId, from, to).then(() => {
      refresh();
      onMoved(from, to);
    }, reportFailure("動かせませんでした"));
  };

  const rename = async (path: string, dir: boolean) => {
    const ext = dir ? null : memoExtensionOf(path);
    const asked = await askName(
      { title: dir ? "フォルダの名前を変更" : "メモの名前を変更", label: ext ? `名前（${ext} はそのまま）` : "名前", initial: dir ? baseName(path) : memoTitle(path), confirmLabel: "変更" },
      (name) => renamedPath(path, dir, name),
      { except: path },
    );
    if (asked) await move(path, asked.path);
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
      onTrashed(path);
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

  return { createMemo, createFolder, rename, moveInto, moveMany, trash };
}

/** 動かしたあとに、覚えているパスの組を付け替える（開いているフォルダ） */
export function remapPaths(paths: readonly string[], from: string, to: string): string[] {
  return paths.map((p) => remapPath(p, from, to));
}

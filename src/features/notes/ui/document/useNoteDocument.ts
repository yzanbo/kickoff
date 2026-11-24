import type { FileContent } from "@shared/foundation/fileTypes";
import { baseName } from "@shared/foundation/path";
import { safeNoteName } from "@shared/notes/names";
import { notesApi } from "@/features/notes/ui/api";
import { errorText } from "@/foundation/ui/query";
import { useDocument } from "@/foundation/ui/document/useDocument";
import { writeSetting } from "@/foundation/ui/storage";
import { storage } from "@/features/notes/ui/storage";
import { notesStore } from "@/features/notes/ui/store";
import { noteDocKey, noteFileRoot } from "@/features/notes/ui/noteLeave";
import { renamedPath } from "@/features/notes/ui/notePaths";

/**
 * 開いているノート 1 つを文書の土台（useDocument）で開く。保存は ⌘S（と保存のボタン・⌘⇧S）だけで、書いている間は保存しない。
 * 書きかけは storage.settings.draft に残し（離れても・アプリを閉じても）、開き直したら未保存のまま戻す。離れる前の確かめは未保存の登録簿（noteLeave.ts）。
 * このノートが変わった知らせ（Kickoff の中でも、Finder・ほかのアプリでも）・窓に戻った・つなぎ直したときに新しさを確かめる（書きかけなら conflict）
 */
export function useNoteDocument(projectId: number, path: string) {
  const key = noteDocKey(projectId, path);
  const doc = useDocument<FileContent>({
    key,
    source: {
      read: (signal) => notesApi("GET /api/projects/:projectId/note", { params: { projectId }, query: { path } }, { signal }),
      write: (content, hash) => notesApi("PUT /api/projects/:projectId/note", { params: { projectId }, body: { path, content, base_hash: hash } }),
    },
    refetchOn: { notes: (e) => e.project_id === projectId && (e.path === null || e.path === path) },
    draft: storage.settings.draft,
    title: baseName(path),
    surface: "notes",
    file: { root: noteFileRoot(projectId), path },
  });
  return {
    ...doc,
    loadError: doc.file === undefined && doc.error ? errorText(doc.error) : null,
    /** 保存の失敗の文 */
    saveError: doc.base && doc.status === "error" ? errorText(doc.error) : null,
    /**
     * ノートの名前を変える（同じフォルダのまま）。書きかけは新しい名前のノートへ持っていく（開き直すと未保存のまま戻る）。
     * 変えたあとのパス（変わらなければ null）。同じ名前のノートがあれば失敗（409）
     */
    rename: async (name: string): Promise<string | null> => {
      const to = renamedPath(path, false, safeNoteName(name));
      const base = doc.base;
      const body = doc.text();
      if (to === path || !base) return null;
      await notesApi("POST /api/projects/:projectId/notes/move", { params: { projectId }, body: { from: path, to } });
      // 前の名前で書きかけを残さない
      doc.discard();
      if (body !== null && body !== base.content) writeSetting(storage.settings.draft(noteDocKey(projectId, to)), { text: body, hash: base.hash });
      notesStore.invalidate(projectId);
      return to;
    },
  };
}

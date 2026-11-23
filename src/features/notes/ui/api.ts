// ノートの API の呼び手（取り決めは @shared/notes/contract.ts。コアの受け口は core/routes/notes.ts）。
// notesShared は新しいプロジェクトのダイアログ（projects。notes より下）が読む既定の場所だけ（土台の api の束に入る）
import { notesContract } from "@shared/notes/contract";
import type { NoteDefaults } from "@shared/notes/types";
import { client } from "@/foundation/ui/api/client";

export const notesApi = client(notesContract);

export const notesShared = {
  noteDefaults: (): Promise<NoteDefaults> => notesApi("GET /api/notes/defaults"),
};

// ノートの API の呼び手（取り決めは @shared/notes/contract.ts。コアの受け口は core/routes/notes.ts）
import { notesContract } from "@shared/notes/contract";
import { client } from "@/foundation/ui/api/client";

export const notesApi = client(notesContract);

// AI が描いた図をノートに保存して開く（visuals の図のカードが open({ kind: "noteFromVisual" }) で頼む。ノートの名前の決まりはここだけ）
import type { ChatVisual } from "@shared/visuals/aiVisual";
import { visualNoteHtml } from "@shared/visuals/visualDocument";
import { datedNoteName, safeNoteName } from "@shared/notes/names";
import { api } from "@/foundation/ui/api";
import { ApiError } from "@/foundation/ui/api/http";
import { openNoteFromChat } from "./openNoteFrom";

/** 同じ名前があったときに番号を付けて試す回数 */
const NAME_TRIES = 20;

/** 図をノートに保存する中身（SVG・HTML は HTML のノート、Mermaid は ```mermaid の Markdown のノート） */
function noteOf(visual: ChatVisual, title: string): { ext: string; content: string } {
  if (visual.kind === "mermaid") return { ext: ".md", content: `# ${title}\n\n\`\`\`mermaid\n${visual.code}\n\`\`\`\n` };
  return { ext: ".html", content: visualNoteHtml(title, visual.code) };
}

/**
 * 図をノートのフォルダのいちばん外側に保存して開く（名前は作った日付と題名。同じ名前があれば「-2」から番号を付ける）。
 * 開く場所はチャットからノートを開くときと同じ設定
 */
export async function saveVisualToNote(visual: ChatVisual, chatId: number | null, projectId: number): Promise<void> {
  const title = visual.title?.trim() || "図";
  const base = datedNoteName(safeNoteName(title), new Date());
  const { ext, content } = noteOf(visual, title);
  for (let n = 1; n <= NAME_TRIES; n++) {
    const path = `${n === 1 ? base : `${base}-${n}`}${ext}`;
    try {
      const ref = await api.createNote(projectId, path, { content });
      openNoteFromChat({ projectId, path: ref.path, chatId });
      return;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) throw e;
    }
  }
  throw new Error("同じ名前のノートが多すぎます。ノートのタブで名前を整理してください");
}

import type { ChatVisual } from "@shared/chat/aiVisual";
import { visualMemoHtml } from "@shared/chat/visualDocument";
import { datedMemoName, safeMemoName } from "@shared/memo/names";
import { api } from "@/api";
import { ApiError } from "@/api/http";
import { openMemoFromChat } from "@/features/memo/openMemoFrom";

/** 同じ名前があったときに番号を付けて試す回数 */
const NAME_TRIES = 20;

/** 図をメモに保存する中身（SVG・HTML は HTML のメモ、Mermaid は ```mermaid の Markdown のメモ） */
function memoOf(visual: ChatVisual, title: string): { ext: string; content: string } {
  if (visual.kind === "mermaid") return { ext: ".md", content: `# ${title}\n\n\`\`\`mermaid\n${visual.code}\n\`\`\`\n` };
  return { ext: ".html", content: visualMemoHtml(title, visual.code) };
}

/**
 * 図をメモのフォルダのいちばん外側に保存して開く（名前は作った日付と題名。同じ名前があれば「-2」から番号を付ける）。
 * 開く場所はチャットからメモを開くときと同じ設定
 */
export async function saveVisualToMemo(visual: ChatVisual, chatId: number, projectId: number): Promise<void> {
  const title = visual.title?.trim() || "図";
  const base = datedMemoName(safeMemoName(title), new Date());
  const { ext, content } = memoOf(visual, title);
  for (let n = 1; n <= NAME_TRIES; n++) {
    const path = `${n === 1 ? base : `${base}-${n}`}${ext}`;
    try {
      const ref = await api.createMemo(projectId, path, { content });
      openMemoFromChat({ projectId, path: ref.path, chatId });
      return;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) throw e;
    }
  }
  throw new Error("同じ名前のメモが多すぎます。メモのタブで名前を整理してください");
}

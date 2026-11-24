// 送る文の組み立て: 指示の後ろに見出しつきの文（添付のパス・届かなかった報告）や文脈を、空行 1 つでつなぐ
import type { Attachment } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import type { ChatAttachments } from "@/features/chat/core/ports";

/**
 * 文の後ろに、空でない節を空行 1 つでつなぐ（足す節がなければ文のまま。文が空白だけなら節だけ）。
 * 指示に添える文脈をつなぐときは文を null にする（どれもなければ null）
 */
export function appendSections(text: string | null, ...sections: (string | null)[]): string | null {
  const present = sections.filter((s): s is string => Boolean(s));
  if (present.length === 0) return text;
  return [...(text?.trim() ? [text] : []), ...present].join("\n\n");
}

/** 送る文（添付のパスを書き添える。添付の口がなければ文のまま） */
export async function composePrompt(attachments: ChatAttachments | undefined, project: Project | null, text: string, files: Attachment[]): Promise<string> {
  return attachments ? attachments.promptNote(text, files, project) : text;
}

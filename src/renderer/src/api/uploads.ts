import type { Attachment } from "@shared/types";
import { postForm, request, withQuery } from "./http";

/** 添付ファイル（アップロード・画面での表示・ほかのチャットのやり取りの記録。コアの routes/uploads.ts） */
export const uploadsApi = {
  /** 添付ファイルをアップロードする */
  upload: async (file: File): Promise<Attachment> => {
    const form = new FormData();
    form.append("file", file);
    const [saved] = await postForm<Attachment[]>("/api/uploads", form);
    return saved;
  },
  /** 別のチャットのやり取りを Markdown の記録にして、添付ファイルとして保存する（いまのチャットに添えて AI に読ませる） */
  chatTranscript: (chatId: number) => request<Attachment>("POST", `/api/chats/${chatId}/transcript`),
};

/** 添付ファイルを画面で開く・表示するための URL */
export function attachmentUrl(a: Attachment): string {
  return withQuery(`/api/uploads/${a.id}`, { mime: a.mime });
}

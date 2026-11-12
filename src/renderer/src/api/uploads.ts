import { TOOL_IMAGE_MTIME_HEADER } from "@shared/chat/toolImage";
import type { Attachment, CaptureAttachment, CaptureBody, FileAttachment } from "@shared/types";
import { postForm, request, requestBlob, withQuery } from "./http";

/** 添付ファイル（アップロード・画面での表示・ほかのチャットのやり取りの記録）とツールの結果の画像。コアの routes/uploads.ts */
export const uploadsApi = {
  /** 添付ファイルをアップロードする */
  upload: async (file: File): Promise<FileAttachment> => {
    const form = new FormData();
    form.append("file", file);
    const [saved] = await postForm<FileAttachment[]>("/api/uploads", form);
    return saved;
  },
  /** 別のチャットのやり取りを Markdown の記録にして、添付ファイルとして保存する（いまのチャットに添えて AI に読ませる） */
  chatTranscript: (chatId: number) => request<FileAttachment>("POST", `/api/chats/${chatId}/transcript`),
  /** 「AI に渡す」で押したときの中身を添付にする（コアが鍵らしい値を伏せ、大きすぎれば頭と終わりを残して切る） */
  capture: (body: CaptureBody) => request<CaptureAttachment>("POST", "/api/captures", body),
  /** 添付ファイルの中身を文字で読む（capture の札を押して中身を見るとき） */
  attachmentText: async (a: Attachment): Promise<string> => (await requestBlob(`/api/uploads/${a.id}`)).blob.text(),
  /**
   * ツールの結果の画像（読むで読んだ画像）を、呼び出しの入力のパスから読む（いまのファイル。最後に変えた時刻 mtime も）。
   * 作業場所・添付・メモのフォルダの外・ないファイルは ApiError（文はそのまま画面に出せる）
   */
  toolImage: async (chatId: number, path: string): Promise<{ blob: Blob; mtime: number | null }> => {
    const { blob, headers } = await requestBlob(withQuery(`/api/chats/${chatId}/tool-image`, { path }));
    const mtime = Number(headers.get(TOOL_IMAGE_MTIME_HEADER));
    return { blob, mtime: Number.isFinite(mtime) && mtime > 0 ? mtime : null };
  },
};

/** 添付ファイルを画面で開く・表示するための URL */
export function attachmentUrl(a: Pick<Attachment, "mime"> & { id?: string }): string {
  return withQuery(`/api/uploads/${a.id}`, { mime: a.mime });
}

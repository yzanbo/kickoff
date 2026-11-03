import { chatTitle } from "../../chatTitle";
import { useEffect, useState, type ClipboardEvent, type DragEvent } from "react";
import type { Attachment } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";

export interface PendingFile {
  key: string;
  file: File;
  previewUrl?: string;
  attachment?: Attachment;
  error?: string;
}

/** チャット欄の添付（📎・ドラッグ＆ドロップ・貼り付け。選んだ時点でアップロードしておき、送信を待たせない） */
export function useComposerFiles() {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);

  // 画像のプレビュー用 URL は不要になったら解放する
  useEffect(() => () => files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function addFiles(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      const key = `${Date.now()}-${Math.random()}`;
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      setFiles((prev) => [...prev, { key, file, previewUrl }]);
      api
        .upload(file)
        .then((attachment) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, attachment } : f))))
        .catch((e: unknown) =>
          setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, error: errorMessage(e) } : f))),
        );
    }
  }

  /** 別のチャットのやり取りを添付する（コアが記録を Markdown のファイルにして返す。チップはファイルと同じに出す） */
  function addChat(run: { id: number; title: string | null }) {
    const key = `${Date.now()}-${Math.random()}`;
    const file = new File([], `チャット-${chatTitle(run.title)}.md`, { type: "text/markdown" });
    setFiles((prev) => [...prev, { key, file }]);
    api
      .chatTranscript(run.id)
      .then((attachment) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, attachment } : f))))
      .catch((e: unknown) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, error: errorMessage(e) } : f))));
  }

  /** アップロード済みの添付を足す（送信待ちの指示を新しいチャットで聞くとき。アップロードし直さない） */
  function addAttachments(list: Attachment[]) {
    const added = list.map((attachment) => ({ key: `${Date.now()}-${Math.random()}`, file: new File([], attachment.name, { type: attachment.mime }), attachment }));
    setFiles((prev) => [...prev, ...added]);
  }

  function removeFile(key: string) {
    setFiles((prev) => {
      const target = prev.find((f) => f.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.key !== key);
    });
  }

  /** 送ったあと: すべて外す */
  function clear() {
    files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length > 0) {
      e.preventDefault();
      addFiles(pasted);
    }
  }

  /** チャット欄の枠に付けるドラッグ＆ドロップの受け口 */
  const dropProps = {
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
        setDragging(true);
      }
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
  };

  return {
    files,
    dragging,
    addFiles,
    addChat,
    addAttachments,
    removeFile,
    clear,
    onPaste,
    dropProps,
    /** アップロードの途中のものがあるか */
    uploading: files.some((f) => !f.attachment && !f.error),
    /** アップロードできた添付 */
    attachments: files.flatMap((f) => (f.attachment ? [f.attachment] : [])),
  };
}

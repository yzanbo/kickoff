import { chatTitle } from "@/features/chat/chatTitle";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import type { Attachment } from "@shared/types";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { readSetting, subscribeSetting, writeSetting, type Setting } from "@/lib/storage";

export interface PendingFile {
  key: string;
  file: File;
  previewUrl?: string;
  attachment?: Attachment;
  error?: string;
}

/**
 * 送る前の添付を残す先（入力欄が描き直されても、利用者が外すまで添付を戻す。アップロードできたものだけを残す）。
 * id: 何の添付か（変わったら、その先に残した添付に入れ替える）。subscribe: ほかの入力欄が同じ先を書き換えたら知らせる（なければ見ない）
 */
export interface AttachmentDraft {
  id: string;
  read: () => readonly Attachment[];
  write: (list: Attachment[]) => void;
  subscribe?: (listener: () => void) => () => void;
}

/** 設定（localStorage）に残す添付の先（既存のチャットの chatAttachmentsDraft。同じチャットの入力欄どうしで書き換えを知らせ合う） */
export const settingAttachmentDraft = (setting: Setting<readonly Attachment[]>): AttachmentDraft => ({
  id: setting.key,
  read: () => readSetting(setting),
  write: (list) => writeSetting(setting, list),
  subscribe: (listener) => subscribeSetting(setting, listener),
});

const newKey = () => `${Date.now()}-${Math.random()}`;

/** 残していた添付をチップにする（いま出しているものと同じ添付は、そのチップのまま。画像のサムネイルは保存先から出す） */
function restore(list: readonly Attachment[], current: readonly PendingFile[] = []): PendingFile[] {
  return list.map(
    (attachment) =>
      current.find((f) => f.attachment?.id === attachment.id) ?? { key: newKey(), file: new File([], attachment.name, { type: attachment.mime }), attachment },
  );
}

const uploadedOf = (files: readonly PendingFile[]) => files.flatMap((f) => (f.attachment ? [f.attachment] : []));

/**
 * チャット欄の添付（📎・ドラッグ＆ドロップ・貼り付け。選んだ時点でアップロードしておき、送信を待たせない）。
 * saved を渡すと、アップロードできた添付をそこに残し、入力欄を作り直したとき（プロジェクトを移って戻ったなど）に戻す（外す・送るまで消さない）
 */
export function useComposerFiles(saved?: AttachmentDraft) {
  const [files, setFiles] = useState<PendingFile[]>(() => restore(saved?.read() ?? []));
  const [dragging, setDragging] = useState(false);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  /** 最後に残した（読んだ）添付の JSON（同じものを書き直さない・自分の書き換えの知らせを読み直さない） */
  const written = useRef(JSON.stringify(uploadedOf(files)));
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 残す先が変わったら（同じ入力欄で別のチャットへ）、その先に残した添付に入れ替える（描いている間に合わせる）
  const [savedId, setSavedId] = useState(saved?.id);
  if (saved?.id !== savedId) {
    setSavedId(saved?.id);
    const next = restore(saved?.read() ?? []);
    written.current = JSON.stringify(uploadedOf(next));
    setFiles(next);
  }

  // アップロードできた添付が変わったら残す（外した・送ったときは空にする）
  const uploadedJson = JSON.stringify(uploadedOf(files));
  useEffect(() => {
    if (uploadedJson === written.current) return;
    written.current = uploadedJson;
    savedRef.current?.write(JSON.parse(uploadedJson) as Attachment[]);
  }, [uploadedJson]);

  // ほかの入力欄（同じチャットのメモの下の入力欄など）が書き換えたら、アップロードの途中のものは残したまま合わせる
  useEffect(
    () =>
      saved?.subscribe?.(() => {
        const list = savedRef.current?.read() ?? [];
        const json = JSON.stringify(list);
        if (json === written.current) return;
        written.current = json;
        setFiles((prev) => [...restore(list, prev), ...prev.filter((f) => !f.attachment && !f.error)]);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved?.id],
  );

  // 画像のプレビュー用 URL は不要になったら解放する
  useEffect(() => () => files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  /** アップロードが終わったとき（入力欄がもうなければ、残す先へじかに足す。移っている間に終わっても添付を失わない） */
  function uploaded(key: string, attachment: Attachment) {
    if (mounted.current) setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, attachment } : f)));
    else savedRef.current?.write([...savedRef.current.read(), attachment]);
  }

  function addFiles(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      const key = newKey();
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      setFiles((prev) => [...prev, { key, file, previewUrl }]);
      api
        .upload(file)
        .then((attachment) => uploaded(key, attachment))
        .catch((e: unknown) =>
          setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, error: errorMessage(e) } : f))),
        );
    }
  }

  /** 別のチャットを参照する: そのやり取りを添付する（コアが記録を Markdown のファイルにして返す。チップはファイルと同じに出す） */
  function addChat(chat: { id: number; title: string | null }) {
    const key = newKey();
    const file = new File([], `チャット履歴-${chatTitle(chat.title)}.md`, { type: "text/markdown" });
    setFiles((prev) => [...prev, { key, file }]);
    api
      .chatTranscript(chat.id)
      .then((attachment) => uploaded(key, attachment))
      .catch((e: unknown) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, error: errorMessage(e) } : f))));
  }

  /** アップロード済みの添付・メモの添付を足す（送信待ちの指示を新しいチャットで聞くとき・メモを添付したとき。アップロードし直さない。同じメモは重ねない） */
  function addAttachments(list: Attachment[]) {
    const added = list.map((attachment) => ({ key: newKey(), file: new File([], attachment.name, { type: attachment.mime }), attachment }));
    setFiles((prev) => [...prev, ...added.filter((a) => a.attachment.memo === undefined || !prev.some((f) => f.attachment?.memo === a.attachment.memo))]);
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

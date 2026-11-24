import { chatTitle } from "@/features/chat/ui/chatTitle";
import { useEffect, useEffectEvent, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { createFilePreviews } from "./filePreviews";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { useKeepAliveHold } from "@/features/chat/ui/screen/keepAlive";
import type { Attachment } from "@shared/chat/types";
import { errorMessage } from "@shared/foundation/errors";
import type { ComposerDraft } from "./composerDraft";
import { uploadsApi } from "@/features/attachments/ui";

export interface PendingFile {
  key: string;
  file: File;
  /** 選んだ画像（プレビューを選んだファイルから出す。残していた添付は保存先のサムネイル） */
  preview?: true;
  attachment?: Attachment;
  error?: string;
}

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
 * 下書きの店を渡すと、アップロードできた添付をそこに残し、入力欄を作り直したとき（プロジェクトを移って戻ったなど）に戻す（外す・送るまで消さない）。
 * 並びは選んだ順（アップロードの終わる順にしない）なので、アップロードの途中のものも含めた並びはこの中に持つ
 */
export function useDraftFiles(draft?: ComposerDraft) {
  const [files, setFiles] = useState<PendingFile[]>(() => restore(draft?.read().attachments ?? []));
  const [dragging, setDragging] = useState(false);
  const draftRef = useLatest(draft);
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
  const [draftId, setDraftId] = useState(draft?.id);
  const [restored, setRestored] = useState<{ json: string } | null>(null);
  if (draft?.id !== draftId) {
    setDraftId(draft?.id);
    const next = restore(draft?.read().attachments ?? []);
    setRestored({ json: JSON.stringify(uploadedOf(next)) });
    setFiles(next);
  }
  // 入れ替えた添付は、その先に残してあるもの（書き直さない）。下の「残す」より先に覚え直す（描く中では ref に書かない）
  useEffect(() => {
    if (restored) written.current = restored.json;
  }, [restored]);

  // アップロードできた添付が変わったら残す（外した・送ったときは空にする）
  const uploadedJson = JSON.stringify(uploadedOf(files));
  useEffect(() => {
    if (uploadedJson === written.current) return;
    written.current = uploadedJson;
    draftRef.current?.write({ attachments: JSON.parse(uploadedJson) as Attachment[] });
  }, [uploadedJson]);

  // ほかの入力欄（同じチャットのノートの下の入力欄など）が書き換えたら、アップロードの途中のものは残したまま合わせる
  // 見張り直すのは残す先（id）が変わったときだけ（店は同じ残す先なら同じもの）
  const subscribeSaved = useEffectEvent((listener: () => void) => draft?.subscribe(listener));
  useEffect(
    () =>
      subscribeSaved(() => {
        const list = draftRef.current?.read().attachments ?? [];
        const json = JSON.stringify(list);
        if (json === written.current) return;
        written.current = json;
        setFiles((prev) => [...restore(list, prev), ...prev.filter((f) => !f.attachment && !f.error)]);
      }),
    [draft?.id],
  );

  // アップロードの途中は、タブを裏に回しても会話の欄を止めない（終わった添付を入力欄に入れるまで）
  const uploading = files.some((f) => !f.attachment && !f.error);
  const hold = useKeepAliveHold("upload");
  useEffect(() => hold(uploading), [uploading, hold]);

  // 画像のプレビューの URL は描いている間だけ持つ（入力欄が外れた・裏のタブに隠れたら解放し、表に戻ったら選んだファイルから作り直す）
  const [previews, setPreviews] = useState(() => createFilePreviews());
  const released = useRef(false);
  useEffect(() => {
    if (released.current) {
      released.current = false;
      setPreviews(createFilePreviews());
    }
    return () => {
      if (previews.releaseAll() > 0) released.current = true;
    };
  }, [previews]);

  /** アップロードが終わったとき（入力欄がもうなければ、残す先へじかに足す。移っている間に終わっても添付を失わない） */
  function uploaded(key: string, attachment: Attachment) {
    if (mounted.current) setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, attachment } : f)));
    else draftRef.current?.write({ attachments: [...draftRef.current.read().attachments, attachment] });
  }

  function addFiles(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      const key = newKey();
      const preview = file.type.startsWith("image/") ? { preview: true as const } : {};
      setFiles((prev) => [...prev, { key, file, ...preview }]);
      uploadsApi
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
    uploadsApi
      .chatTranscript(chat.id)
      .then((attachment) => uploaded(key, attachment))
      .catch((e: unknown) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, error: errorMessage(e) } : f))));
  }

  function removeFile(key: string) {
    previews.drop(key);
    setFiles((prev) => prev.filter((f) => f.key !== key));
  }

  /** 送ったあと: すべて外す */
  function clear() {
    previews.releaseAll();
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
    /** 札に出すもの（選んだ画像はプレビューの URL 付き） */
    files: files.map((f) => (f.preview ? { ...f, previewUrl: previews.of(f.key, f.file) } : f)),
    dragging,
    addFiles,
    addChat,
    removeFile,
    clear,
    onPaste,
    dropProps,
    /** アップロードの途中のものがあるか */
    uploading,
    /** アップロードできた添付 */
    attachments: files.flatMap((f) => (f.attachment ? [f.attachment] : [])),
  };
}

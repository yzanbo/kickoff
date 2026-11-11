import { useEffect, useState } from "react";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { formatBytes } from "@/lib/format";
import { useAttachmentViewer } from "@/features/chat/attachments/useAttachmentViewer";

/** 読み込んだ画像（画面で使う URL・大きさ・最後に変えた時刻） */
interface Loaded {
  url: string;
  bytes: number;
  mtime: number | null;
}

/** 読んだ時刻より、ファイルを変えた時刻がこれ以上あとなら「読んだあとに変わった」とする（時刻の丸めの差を除く） */
const CHANGED_SLACK_MS = 1000;

/**
 * 読む（Read）で読んだ画像を、呼び出しを開いたときに出す（コアは結果の画像を記録に残さず「[image]」の文字だけなので、
 * 入力のパスから、いまのファイルを読む。作業場所・添付・メモのフォルダの外・ないファイルは、その理由だけを出す）。
 * パスは見出しの行に出ているので、ここには縮小した画像と、縦横の大きさ・ファイルの大きさを添える。押すと大きく見る（右クリックでコピー・保存）。
 * 読んだ時刻（結果の記録の時刻 readAt）よりあとにファイルが変わっていれば、AI が見たものと違うかもしれないと添える
 */
export function ReadImage({ chatId, path, readAt }: { chatId: number; path: string; readAt: string | undefined }) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [dims, setDims] = useState<{ width: number; height: number }>();
  const name = path.slice(path.lastIndexOf("/") + 1);
  const viewer = useAttachmentViewer(loaded ? [{ src: loaded.url, name }] : []);

  useEffect(() => {
    let alive = true;
    let url: string | undefined;
    setLoaded(undefined);
    setError(undefined);
    api
      .toolImage(chatId, path)
      .then(({ blob, mtime }) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setLoaded({ url, bytes: blob.size, mtime });
      })
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [chatId, path]);

  if (error) return <p className="tool-image-note muted small">{error}</p>;
  if (!loaded) return <p className="tool-image-note muted small">読み込み中…</p>;
  const readTime = readAt ? Date.parse(readAt) : NaN;
  const changed = loaded.mtime !== null && Number.isFinite(readTime) && loaded.mtime > readTime + CHANGED_SLACK_MS;
  return (
    <div className="tool-image">
      <button
        type="button"
        className="tool-image-thumb"
        data-tip="大きく表示（右クリックでコピー・保存）"
        onClick={() => viewer.open(0)}
        onContextMenu={(e) => viewer.menu(e, 0)}
      >
        <img src={loaded.url} alt={name} onLoad={(e) => setDims({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />
      </button>
      <p className="tool-image-meta muted small">
        {dims && `${dims.width} × ${dims.height} · `}
        {formatBytes(loaded.bytes)}
      </p>
      {changed && <p className="tool-image-note warn-text small">読んだあとに変わっています（いまのファイルを表示しています）</p>}
      {viewer.element}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { formatBytes } from "@/lib/format";
import { useSizeObserver } from "@/hooks/useSizeObserver";
import { useAttachmentViewer } from "@/features/chat/attachments/useAttachmentViewer";
import { usePastWorkplaceAt } from "@/features/chat/timeline/PastWorkplace";
import { readImageHeight, readImageKey, rememberReadImageHeight } from "./readImageHeights";

/** 読み込んだ画像（画面で使う URL・大きさ・最後に変えた時刻） */
interface Loaded {
  url: string;
  bytes: number;
  mtime: number | null;
}

/** 読んだ時刻より、ファイルを変えた時刻がこれ以上あとなら「読んだあとに変わった」とする（時刻の丸めの差を除く） */
const CHANGED_SLACK_MS = 1000;
/** 描かなくなって（隠れて）から、読んだ画像を捨てるまでの時間 */
const RELEASE_MS = 10 * 60_000;

/**
 * 読む（Read）で読んだ画像を、呼び出しを開いたときに出す（コアは結果の画像を記録に残さず「[image]」の文字だけなので、
 * 入力のパスから、いまのファイルを読む。作業場所・添付・メモのフォルダの外・ないファイルは、その理由だけを出す）。
 * パスは見出しの行に出ているので、ここには縮小した画像と、縦横の大きさ・ファイルの大きさを添える。押すと大きく見る（右クリックでコピー・保存）。
 * 読んだ時刻（結果の記録の時刻 readAt）よりあとにファイルが変わっていれば、AI が見たものと違うかもしれないと添える
 */
export function ReadImage({ chatId, path, readAt }: { chatId: number; path: string; readAt: string | undefined }) {
  const [loaded, setLoaded] = useState<Loaded>();
  // 作業場所を移した区切りより前の呼び出しなら、そのときの作業場所から読む
  const at = usePastWorkplaceAt();
  const [error, setError] = useState<string>();
  const [dims, setDims] = useState<{ width: number; height: number }>();
  const name = path.slice(path.lastIndexOf("/") + 1);
  const viewer = useAttachmentViewer(loaded ? [{ src: loaded.url, name }] : []);
  // 前に描いたときの高さ（読み込み中・画像を解くまでの間、この高さで場所を取る）と、描けたあとの高さを覚える
  const key = readImageKey(chatId, at === undefined ? path : `${at}:${path}`);
  const known = readImageHeight(key);
  const sizeRef = useSizeObserver<HTMLDivElement>(({ height }) => {
    if (dims) rememberReadImageHeight(key, height);
  });

  // 読んだ画像の URL（隠した会話の欄（Activity）を表に戻すと effect が流れ直すので、同じ画像なら読み直さない。
  // 片付けでは RELEASE_MS 待ってから捨て、その間に戻れば使い続ける。捨てたら、次に描いたときに読み直す）
  const held = useRef<{ key: string; url: string; timer?: number } | null>(null);
  useEffect(() => {
    const id = readImageKey(chatId, at === undefined ? path : `${at}:${path}`);
    let alive = true;
    const release = () => {
      alive = false;
      const h = held.current;
      if (!h || h.timer !== undefined) return;
      h.timer = window.setTimeout(() => {
        URL.revokeObjectURL(h.url);
        if (held.current !== h) return;
        held.current = null;
        setLoaded(undefined);
      }, RELEASE_MS);
    };
    const h = held.current;
    if (h?.key === id) {
      window.clearTimeout(h.timer);
      h.timer = undefined;
      return release;
    }
    setLoaded(undefined);
    setError(undefined);
    api
      .toolImage(chatId, path, at)
      .then(({ blob, mtime }) => {
        if (!alive) return;
        const url = URL.createObjectURL(blob);
        held.current = { key: id, url };
        setLoaded({ url, bytes: blob.size, mtime });
      })
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    return release;
  }, [chatId, path, at]);

  if (error) return <p className="tool-image-note muted small">{error}</p>;
  if (!loaded) {
    // 前に描いた画像なら、その高さの枠で待つ（読めたときに下の行を動かさない）
    if (known === undefined) return <p className="tool-image-note muted small">読み込み中…</p>;
    return (
      <div className="tool-image tool-image-wait" style={{ height: known }}>
        <p className="tool-image-meta muted small">読み込み中…</p>
      </div>
    );
  }
  const readTime = readAt ? Date.parse(readAt) : NaN;
  const changed = loaded.mtime !== null && Number.isFinite(readTime) && loaded.mtime > readTime + CHANGED_SLACK_MS;
  return (
    <div ref={sizeRef} className="tool-image" style={!dims && known !== undefined ? { minHeight: known } : undefined}>
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

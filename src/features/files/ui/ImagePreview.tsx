import { useEffect, useEffectEvent, useState } from "react";
import { errorMessage } from "@shared/foundation/errors";
import { api } from "@/foundation/ui/api";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { ImageViewer } from "@/foundation/ui/kit/imageViewer/ImageViewer";
import { formatBytes } from "@shared/foundation/text/bytes";
import { useGitTarget } from "@/foundation/ui/workplace/workplaceContext";

/**
 * 画像のファイルのプレビュー（ファイルタブ・右の欄・別ウィンドウの FileView。VS Code の画像のプレビューと同じく、
 * 透明な所が分かる市松模様の上に、入るなら元の大きさ、入らなければ縮めて真ん中に出す）。下に縦横の大きさとファイルの大きさ。
 * 押すと大きく見る（拡大・縮小・コピー・保存）。中身はコアから読む（icns は中の PNG）。source を渡すと、それを SVG として出す
 * （SVG のコードを書きかけのとき。保存していない中身も見える）。version が変わるたびに読み直す（ほかで変わったとき）
 */
export function ImagePreview({ projectId, path, version, source }: { projectId: number; path: string; version: number; source?: string }) {
  const { target, key } = useGitTarget(projectId);
  const [image, setImage] = useState<{ url: string; bytes: number }>();
  const [error, setError] = useState<string>();
  const [dims, setDims] = useState<{ width: number; height: number }>();
  const [viewing, setViewing] = useState(false);
  const name = path.slice(path.lastIndexOf("/") + 1);

  // 読み直すのは、作業場所（key で表す）・ファイル・版・書きかけの中身が変わったときだけ
  const readImage = useEffectEvent(() => (source !== undefined ? Promise.resolve(new Blob([source], { type: "image/svg+xml" })) : api.projectImage(target, path)));
  useEffect(() => {
    let alive = true;
    let url: string | undefined;
    // 読み直している間も前の画像を出したまま（ちらつかせない）
    setError(undefined);
    const blob = readImage();
    blob.then(
      (b) => {
        if (!alive) return;
        url = URL.createObjectURL(b);
        setImage({ url, bytes: b.size });
      },
      (e: unknown) => alive && setError(errorMessage(e)),
    );
    return () => {
      alive = false;
      // 次の画像を出すまで前の URL を使うので、少し待ってから捨てる
      if (url) {
        const old = url;
        setTimeout(() => URL.revokeObjectURL(old), 1000);
      }
    };
  }, [key, path, version, source]);

  if (error) return <ErrorText message={error} className="diff-message" />;
  if (!image) return <p className="muted small diff-message">読み込み中…</p>;
  return (
    <div className="image-preview">
      <div className="image-preview-stage">
        <button type="button" className="image-preview-frame" data-tip="大きく表示" onClick={() => setViewing(true)}>
          <img
            src={image.url}
            alt={name}
            onLoad={(e) => setDims({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
            onError={() => setError("この画像は表示できません（形式が壊れているか、対応していない形です）")}
          />
        </button>
      </div>
      <p className="image-preview-meta muted small">
        {dims && `${dims.width} × ${dims.height}・`}
        {formatBytes(image.bytes)}
      </p>
      {viewing && <ImageViewer src={image.url} name={name} onClose={() => setViewing(false)} />}
    </div>
  );
}

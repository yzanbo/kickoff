import { useState } from "react";
import { useQuery } from "@/foundation/ui/query";
import { useObjectUrl } from "@/foundation/ui/hooks/useObjectUrl";
import { errorMessage } from "@shared/foundation/errors";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { ImageViewer } from "@/foundation/ui/kit/imageViewer/ImageViewer";
import { formatBytes } from "@shared/foundation/text/bytes";
import { useWorkplace } from "@/foundation/ui/workplace/workplaceContext";
import { workplaceKey } from "@/foundation/ui/workplace/workplace";
import { filesApi } from "./api";
import { workdirInput } from "@/foundation/ui/api/workdir";

/**
 * 画像のファイルのプレビュー（ファイルタブ・右の欄・別ウィンドウの FileView。VS Code の画像のプレビューと同じく、
 * 透明な所が分かる市松模様の上に、入るなら元の大きさ、入らなければ縮めて真ん中に出す）。下に縦横の大きさとファイルの大きさ。
 * 押すと大きく見る（拡大・縮小・コピー・保存）。中身はコアから読む（icns は中の PNG）。source を渡すと、それを SVG として出す
 * （SVG のコードを書きかけのとき。保存していない中身も見える）。version が変わるたびに読み直す（ほかで変わったとき）
 */
export function ImagePreview({ projectId, path, version, source }: { projectId: number; path: string; version: number; source?: string }) {
  const target = useWorkplace(projectId);
  const key = workplaceKey(target);
  const [broken, setBroken] = useState<string | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number }>();
  const [viewing, setViewing] = useState(false);
  const name = path.slice(path.lastIndexOf("/") + 1);

  // 読み直すのは、作業場所（key で表す）・ファイル・版・書きかけの中身が変わったときだけ。読み直している間も前の画像を出したまま（ちらつかせない）
  const blob = useQuery(
    ["fileImage", key, path, source ?? null],
    (signal) => (source !== undefined ? Promise.resolve(new Blob([source], { type: "image/svg+xml" })) : filesApi("GET /api/projects/:projectId/file/image", workdirInput(target, { path }), { signal }).then((r) => r.blob)),
    { deps: [version], keepPrevious: true },
  );
  const url = useObjectUrl(blob.data);
  const image = url && blob.data ? { url, bytes: blob.data.size } : undefined;
  // 読めなかった・画像として描けなかった（描けなかったのは、その URL の間だけ）
  const error = blob.error ? errorMessage(blob.error) : broken !== null && broken === url ? "この画像は表示できません（形式が壊れているか、対応していない形です）" : undefined;

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
            onError={() => setBroken(image.url)}
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

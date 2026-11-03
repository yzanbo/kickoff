/**
 * 画像をクリップボードに画像としてコピーする（Chromium のクリップボードは画像を PNG でしか受けないので、PNG にして書く）。
 * 押した直後に write を呼び、中身は読み込みが終わってから渡す（待ってから呼ぶと、押した操作によるものと見なされないことがある）
 */
export function copyImage(src: string): Promise<void> {
  return navigator.clipboard.write([new ClipboardItem({ "image/png": pngOf(src) })]);
}

/** 画像を読み込み、PNG でなければ PNG にする（GIF は最初のこま） */
async function pngOf(src: string): Promise<Blob> {
  const res = await fetch(src, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`画像を読み込めませんでした（${res.status}）`);
  const blob = await res.blob();
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("画像を PNG に変換できませんでした"))), "image/png"),
  );
}

/** 画像をアプリの中で保存する（送った添付のダウンロードと同じく <a download>。外のブラウザには Kickoff のログインがないので開かない） */
export function downloadImage(src: string, name: string) {
  const link = document.createElement("a");
  link.href = src;
  link.download = name;
  link.click();
}

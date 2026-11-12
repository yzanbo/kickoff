/** 文をファイルとしてアプリの中で保存する（<a download>。画像の保存・添付のダウンロードと同じく外のブラウザには渡さない） */
export function downloadText(name: string, text: string, type: string) {
  downloadBlob(name, new Blob([text], { type: `${type};charset=utf-8` }));
}

/** Blob（画像など）をファイルとしてアプリの中で保存する */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // 保存が始まってから捨てる
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

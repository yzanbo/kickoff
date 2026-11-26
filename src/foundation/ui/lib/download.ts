// アプリの中で保存する（<a download>）。外のブラウザには Kickoff のログインがないので、画像・添付・表の書き出しのどれも外に渡さない

/** URL（送った添付・画像）をファイルとしてアプリの中で保存する */
export function downloadUrl(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
}

/** 文をファイルとしてアプリの中で保存する */
export function downloadText(name: string, text: string, type: string) {
  downloadBlob(name, new Blob([text], { type: `${type};charset=utf-8` }));
}

/** Blob（画像など）をファイルとしてアプリの中で保存する */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, name);
  // 保存が始まってから捨てる
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

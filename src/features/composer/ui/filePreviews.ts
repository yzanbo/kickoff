// 送る前の画像のプレビューの URL（選んだファイルから作る blob の URL）。描いている間だけ持ち、入力欄が外れた・裏のタブに隠れたら解放する

interface PreviewUrls {
  create(file: File): string;
  revoke(url: string): void;
}

const BROWSER_URLS: PreviewUrls = { create: (file) => URL.createObjectURL(file), revoke: (url) => URL.revokeObjectURL(url) };

/**
 * ファイルごと（key）のプレビューの URL を持つ。of は、なければ作る（解放したあとに呼べば作り直す = 裏のタブから戻ったとき）。
 * drop は 1 つ、releaseAll はすべてを解放する（入力欄が外れた・隠れたとき。持っていた数を返す）
 */
export function createFilePreviews(urls: PreviewUrls = BROWSER_URLS) {
  const shown = new Map<string, string>();
  return {
    of(key: string, file: File): string {
      let url = shown.get(key);
      if (url === undefined) {
        url = urls.create(file);
        shown.set(key, url);
      }
      return url;
    },
    drop(key: string) {
      const url = shown.get(key);
      if (url === undefined) return;
      urls.revoke(url);
      shown.delete(key);
    },
    releaseAll(): number {
      const count = shown.size;
      for (const url of shown.values()) urls.revoke(url);
      shown.clear();
      return count;
    },
  };
}

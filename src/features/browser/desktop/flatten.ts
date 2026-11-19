// 撮った画像の透明なところを白で埋める（Electron に依らないのでテストする）。
// 背景を決めていないページは透明に撮れ、JPEG にすると黒くなる（利用者には webview の要素の白の上に見えている）

/**
 * BGRA の画素（Chromium の画像は、色に透明度を掛けた形）を、白の上に置いた色にする（その場で書き換える）。
 * 色に透明度を掛けた形なので、白の上の色は「色 + (255 - 透明度)」
 */
export function flattenOnWhite(pixels: Uint8Array): Uint8Array {
  for (let i = 0; i < pixels.length; i += 4) {
    const rest = 255 - pixels[i + 3];
    if (rest === 0) continue;
    pixels[i] = Math.min(255, pixels[i] + rest);
    pixels[i + 1] = Math.min(255, pixels[i + 1] + rest);
    pixels[i + 2] = Math.min(255, pixels[i + 2] + rest);
    pixels[i + 3] = 255;
  }
  return pixels;
}

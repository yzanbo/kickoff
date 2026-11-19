// 読むで読んだ画像（ReadImage）の欄の、描いたときの高さの覚え。
// 画像は開いたときに読み直す（流れの窓で行が外れて戻る・タブを開き直すと読み直す）ので、読み込み中・画像を解くまでの間は、
// 前に描いたときの高さの枠で場所を取り、読めたときに下の行が動かないようにする（Mermaid の図の高さの覚えと同じ形）
import { createLruMap } from "@/lib/lruMap";

/** 覚える画像の数 */
const MAX_IMAGES = 500;

const heights = createLruMap<string, number>(MAX_IMAGES);

/** 覚える鍵（チャットとパス。同じパスでもチャットが違えば作業場所が違う） */
export const readImageKey = (chatId: number, path: string) => `${chatId}\n${path}`;

/** 描いたときの高さを覚える（0 = 隠れている間の知らせは覚えない） */
export function rememberReadImageHeight(key: string, height: number) {
  if (height > 0) heights.set(key, Math.round(height));
}

/** 前に描いたときの高さ（なければ undefined。見積もらない = 知らない画像の高さは決めない） */
export const readImageHeight = (key: string): number | undefined => heights.get(key);

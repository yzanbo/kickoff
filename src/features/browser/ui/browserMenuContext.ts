import type { Params } from "electron";
import { webUrlOf } from "@shared/foundation/linkTarget";

type Context = Pick<Params, "isEditable" | "formControlType" | "selectionText" | "linkURL" | "mediaType" | "hasImageContents" | "srcURL">;

/** 押した要素で出す項目を決める。リンク付きの画像では両方出すが、入力欄の文は検索やチャットには渡さない */
export function browserMenuContext(p: Context) {
  const linkUrl = webUrlOf(p.linkURL)?.href ?? null;
  const linkAddress = linkUrl ?? (/^(mailto|tel):/i.test(p.linkURL) ? p.linkURL : null);
  const password = p.formControlType === "input-password";
  const selection = p.isEditable || password || !p.selectionText.trim() ? null : p.selectionText;
  const copyImage = p.mediaType === "canvas" || (p.mediaType === "image" && p.hasImageContents);
  const mediaLabel = {
    image: "画像", canvas: "画像", audio: "音声", video: "動画",
    none: null, file: null, plugin: null,
  }[p.mediaType];
  const mediaUrl = mediaLabel ? webUrlOf(p.srcURL)?.href ?? null : null;
  // blob や data の画像は新しいタブでは開かず、そのページからの保存だけを認める
  const canDownloadLocal = (mediaLabel !== null && /^blob:/i.test(p.srcURL)) ||
    (mediaLabel === "画像" && /^data:image\//i.test(p.srcURL));
  const downloadUrl = mediaUrl ?? (canDownloadLocal ? p.srcURL : null);
  return {
    linkUrl, linkAddress, password, selection, copyImage, mediaLabel, mediaUrl, downloadUrl,
    pageActions: !p.isEditable && !password && !selection && !linkAddress && !mediaLabel,
  };
}

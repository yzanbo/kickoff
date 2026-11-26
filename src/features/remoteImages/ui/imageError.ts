const IMAGE_ERROR_PREFIX = "画像を読み込めませんでした";

/** 読めなかった理由の文（コアの画像の口は「画像を読み込めませんでした（…）」の形で返すので、前置きを重ねない） */
export function imageErrorText(message: string): string {
  return message.startsWith(IMAGE_ERROR_PREFIX) ? message : `${IMAGE_ERROR_PREFIX}（${message}）`;
}

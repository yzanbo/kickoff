// 返答の画像をホストごとにまとめる決まり（「host から画像を n 件表示」の数・カーソルを当てたときの URL の並び）
import { remoteImageOf } from "@shared/links/remoteImages";

/** 1 つのホストの画像のまとまり */
export interface ImageHostGroup {
  host: string;
  /** そのホストの画像の URL（書いた順・重ねない） */
  urls: string[];
  /** https でない画像があるか（暗号化していないと分かる印を付ける） */
  insecure: boolean;
}

/** 返答に書かれた画像の src から、そのホストのまとまり（ないときも自分の 1 枚だけのまとまりにする） */
export function hostGroupOf(sources: readonly string[], self: { url: string; host: string; secure: boolean }): ImageHostGroup {
  const urls: string[] = [];
  let insecure = false;
  for (const src of sources) {
    const r = remoteImageOf(src);
    if (!r || r.host !== self.host || urls.includes(r.url)) continue;
    urls.push(r.url);
    if (!r.secure) insecure = true;
  }
  if (!urls.includes(self.url)) {
    urls.unshift(self.url);
    if (!self.secure) insecure = true;
  }
  return { host: self.host, urls, insecure };
}

/** カーソルを当てたときに並べる URL の数 */
const TIP_URLS = 5;

/** カーソルを当てたときの説明（初めの数件と、多ければ「ほか n 件」） */
export function urlsTip(urls: readonly string[]): string {
  const shown = urls.slice(0, TIP_URLS);
  const rest = urls.length - shown.length;
  return rest > 0 ? `${shown.join("\n")}\nほか ${rest} 件 ―「URL を見る」で全部` : shown.join("\n");
}

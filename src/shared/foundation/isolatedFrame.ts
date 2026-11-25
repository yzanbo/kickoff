// 閉じた枠（sandbox="allow-scripts" の iframe・スマホの WebView）に入れるページの CSP の土台。
// 枠の中から外へは通信させない（connect-src 'none'）・別のページを枠に入れさせない・フォームを送らせない・base を変えさせない。
// 枠ごとに違うのは、スクリプト・スタイル・画像・フォント・音と動画を読める所だけ（書かなければ何も読めない）

/** 枠ごとに足す読み込み先（CSP のソースの並び） */
export interface IsolatedFrameSources {
  script?: readonly string[];
  style?: readonly string[];
  img?: readonly string[];
  font?: readonly string[];
  media?: readonly string[];
}

/** 閉じた枠のページの CSP（default-src 'none' に、読み込み先を足したものと、通信・枠・フォーム・base を止めるもの） */
export function isolatedFrameCsp(sources: IsolatedFrameSources): string {
  const directive = (name: string, list: readonly string[] | undefined) => (list && list.length > 0 ? [`${name} ${list.join(" ")}`] : []);
  return [
    "default-src 'none'",
    ...directive("script-src", sources.script),
    ...directive("style-src", sources.style),
    ...directive("img-src", sources.img),
    ...directive("font-src", sources.font),
    ...directive("media-src", sources.media),
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

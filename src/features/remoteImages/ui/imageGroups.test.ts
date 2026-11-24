import { test } from "vitest";
import assert from "node:assert/strict";
import { hostGroupOf, urlsTip } from "./imageGroups";

const self = (url: string) => ({ url, host: new URL(url).host, secure: url.startsWith("https:") });

test("hostGroupOf: 同じホストの画像を書いた順に重ねずまとめ、http があれば暗号化なしの印", () => {
  const sources = ["https://a.example/1.png", "https://b.example/x.png", "http://a.example/2.png", "https://a.example/1.png", "docs/local.png"];
  assert.deepEqual(hostGroupOf(sources, self("https://a.example/1.png")), { host: "a.example", urls: ["https://a.example/1.png", "http://a.example/2.png"], insecure: true });
  assert.deepEqual(hostGroupOf(sources, self("https://b.example/x.png")), { host: "b.example", urls: ["https://b.example/x.png"], insecure: false });
  // 文から拾えなかった画像でも、自分の 1 枚のまとまりにする
  assert.deepEqual(hostGroupOf([], self("https://c.example/z.png")).urls, ["https://c.example/z.png"]);
});

test("urlsTip: 初めの 5 件と、多ければ「ほか n 件」", () => {
  const urls = Array.from({ length: 7 }, (_, i) => `https://a.example/${i}.png`);
  assert.equal(urlsTip(urls.slice(0, 2)), "https://a.example/0.png\nhttps://a.example/1.png");
  assert.match(urlsTip(urls), /a\.example\/4\.png\nほか 2 件/);
});

import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";
import { MarkdownImagesContext, type MarkdownImageProps } from "./markdownImages";

/** チャットの画面と同じく画像の描き方を差し込んで描き、画像ごとに渡された src と同じ所の画像の一覧を集める */
function imagesOf(text: string): Pick<MarkdownImageProps, "src" | "sources">[] {
  const calls: Pick<MarkdownImageProps, "src" | "sources">[] = [];
  const value = { render: ({ src, sources }: MarkdownImageProps) => (calls.push({ src, sources }), null) };
  renderToStaticMarkup(createElement(MarkdownImagesContext.Provider, { value }, createElement(Markdown, null, text)));
  return calls;
}

test("画像の数: 描く木から数える（HTML の img も入り、コードの中・描かない img は入らない）", () => {
  const all = ["https://a.example/1.png", "https://a.example/2.png", "https://a.example/3.png"];
  const calls = imagesOf(
    '![1](https://a.example/1.png)\n\n<img src="https://a.example/2.png" width="100">\n\n`![x](https://a.example/x.png)` `<img src="https://a.example/y.png">`\n\n<p><img src="https://a.example/3.png"></p>\n\n<img src="javascript:x">',
  );
  assert.deepEqual(
    calls.map((c) => c.src),
    all,
  );
  for (const c of calls) assert.deepEqual(c.sources, all);
});

test("画像の数: たたむ部分の中は外の数に入らず、開いた部分の中で数える", () => {
  const calls = imagesOf(
    '![外](https://a.example/out.png)\n\n<details open>\n<summary>題</summary>\n\n![中](https://a.example/in.png)\n\n</details>\n\n<details>\n<summary>閉</summary>\n\n![閉](https://a.example/closed.png)\n\n</details>',
  );
  assert.deepEqual(calls, [
    { src: "https://a.example/out.png", sources: ["https://a.example/out.png"] },
    { src: "https://a.example/in.png", sources: ["https://a.example/in.png"] },
  ]);
});

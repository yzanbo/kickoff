import { createElement, Fragment } from "react";

/** 見つかった所（[start, end) の並び。重ならず前から順）を <mark> で包んで描く */
export function Highlight({ text, marks }: { text: string; marks: readonly (readonly [number, number])[] }) {
  const parts = [];
  let at = 0;
  for (const [start, end] of marks) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(createElement("mark", { key: start }, text.slice(start, end)));
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return createElement(Fragment, null, ...parts);
}

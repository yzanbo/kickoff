import assert from "node:assert/strict";
import { test } from "vitest";
import { withBaseHref } from "./htmlPage";

test("withBaseHref: <head> の直後、なければ <html> の直後・doctype の後ろ・先頭に入れる", () => {
  const b = '<base href="http://x/a?b=1&amp;c">';
  assert.equal(withBaseHref("<!doctype html><html><head lang=ja><title>t</title></head></html>", "http://x/a?b=1&c"), `<!doctype html><html><head lang=ja>${b}<title>t</title></head></html>`);
  assert.equal(withBaseHref("<HTML><body>x</body></HTML>", "http://x/a?b=1&c"), `<HTML>${b}<body>x</body></HTML>`);
  assert.equal(withBaseHref("<!DOCTYPE html>\n<p>x</p>", "http://x/a?b=1&c"), `<!DOCTYPE html>${b}\n<p>x</p>`);
  assert.equal(withBaseHref("<p>x</p>", "http://x/a?b=1&c"), `${b}<p>x</p>`);
  // <header> を <head> と取り違えない
  assert.equal(withBaseHref("<header>x</header>", "http://x/a?b=1&c"), `${b}<header>x</header>`);
});

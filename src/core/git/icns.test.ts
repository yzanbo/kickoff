import assert from "node:assert/strict";
import { test } from "node:test";
import { largestIcnsPng } from "./icns.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const entry = (type: string, body: Buffer) => {
  const head = Buffer.alloc(8);
  head.write(type, 0, "latin1");
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
};
const icns = (...entries: Buffer[]) => {
  const body = Buffer.concat(entries);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "latin1");
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
};

test("icns の中のいちばん大きい PNG を取り出す（PNG でない項目は飛ばす）", () => {
  const small = Buffer.concat([PNG, Buffer.from("small")]);
  const large = Buffer.concat([PNG, Buffer.from("large-image")]);
  const data = icns(entry("ic07", small), entry("ic04", Buffer.from("ARGB-bitmap")), entry("ic10", large), entry("info", Buffer.from("plist")));
  assert.deepEqual(largestIcnsPng(data), large);
});

test("icns でない・PNG がない・壊れている項目は null か、そこまでで止める", () => {
  assert.equal(largestIcnsPng(Buffer.from("not an icns file")), null);
  assert.equal(largestIcnsPng(icns(entry("ic04", Buffer.from("bitmap")))), null);
  const broken = icns(entry("ic07", Buffer.concat([PNG, Buffer.from("ok")])));
  broken.writeUInt32BE(9999, 12); // 項目の長さが全体を超える
  assert.equal(largestIcnsPng(broken), null);
});

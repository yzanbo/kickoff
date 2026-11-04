import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { crxZipOffset, unpackCrx } from "./crx";

test("CRX3 のヘッダーを読み飛ばして中身を展開し、_metadata は除く", async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-crx-"));
  fs.mkdirSync(path.join(work, "src", "_metadata"), { recursive: true });
  fs.writeFileSync(path.join(work, "src", "manifest.json"), '{"name":"Test","version":"1.0","manifest_version":3}');
  fs.writeFileSync(path.join(work, "src", "_metadata", "verified_contents.json"), "{}");
  execFileSync("zip", ["-q", "-r", path.join(work, "ext.zip"), "."], { cwd: path.join(work, "src") });
  const zip = fs.readFileSync(path.join(work, "ext.zip"));
  const header = Buffer.from("fake-proto-header");
  const prefix = Buffer.alloc(12);
  prefix.write("Cr24", 0);
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(header.length, 8);
  const crx = Buffer.concat([prefix, header, zip]);

  assert.equal(crxZipOffset(crx), 12 + header.length);
  const target = path.join(work, "out");
  await unpackCrx(crx, target);
  assert.ok(fs.existsSync(path.join(target, "manifest.json")));
  assert.ok(!fs.existsSync(path.join(target, "_metadata")));
  assert.throws(() => crxZipOffset(Buffer.from("PK\u0003\u0004....")), /形式/);
});

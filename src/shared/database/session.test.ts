import assert from "node:assert/strict";
import { test } from "vitest";
import { countsAsConnected, parseSession, sessionName, type DbSessionName } from "./session";

test("sessionName と parseSession: 組んで読むと戻る（キーに「:」があっても）", () => {
  const names: DbSessionName[] = [
    { kind: "shared", connectionId: 12, key: "/Users/a/repo:-" },
    { kind: "sql", connectionId: 3, key: "sql-1731000000000-ab12" },
    { kind: "edit", connectionId: 7, key: "1b4e28ba-2fa1-11d2-883f-0016d3cca427" },
    { kind: "ai", connectionId: 1, key: "a:b:c" },
    { kind: "sql", connectionId: 5, key: "" },
  ];
  for (const s of names) assert.deepEqual(parseSession(sessionName(s)), s);
  assert.equal(sessionName({ kind: "shared", connectionId: 12, key: "-:main" }), "shared:12:-:main");
});

test("parseSession: 知らない種類・接続の ID が正の整数でない名前は null", () => {
  for (const name of ["tree:1:x", "sql:0:x", "sql:-1:x", "sql:x:y", "sql:1", "", "SQL:1:x"]) assert.equal(parseSession(name), null, name);
});

test("countsAsConnected: 木・テーブルと SQL のタブだけを数える", () => {
  const kinds = (["shared", "sql", "edit", "ai"] as const).filter((kind) => countsAsConnected({ kind, connectionId: 1, key: "" }));
  assert.deepEqual(kinds, ["shared", "sql"]);
});

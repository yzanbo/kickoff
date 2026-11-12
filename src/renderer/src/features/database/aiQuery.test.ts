import assert from "node:assert/strict";
import { test } from "node:test";
import type { DbConnection } from "@shared/types";
import { aiQueryConnection } from "./aiQuery";

const conn = (id: number, name: string, ai_access: DbConnection["ai_access"]) => ({ id, name, ai_access }) as DbConnection;

test("aiQueryConnection: 名前があればその接続、省いていれば AI に見せる接続が 1 つのときだけ", () => {
  const list = [conn(1, "本番", "none"), conn(2, "開発", "allow"), conn(3, "検証", "none")];
  assert.equal(aiQueryConnection(list, "開発")?.id, 2);
  assert.equal(aiQueryConnection(list, "ない"), null);
  assert.equal(aiQueryConnection(list, undefined)?.id, 2);
  assert.equal(aiQueryConnection([...list, conn(4, "ステージング", "ask")], undefined), null);
  assert.equal(aiQueryConnection([], undefined), null);
});

test("aiQueryConnection: 名前を省いた呼び出しは、結果の文の「接続「名前」の結果」から引く（いまは AI に見せない接続でも）", () => {
  const list = [conn(1, "本番", "none"), conn(2, "開発", "allow")];
  assert.equal(aiQueryConnection(list, undefined, "接続「本番」の結果。<db_data> …")?.id, 1);
  assert.equal(aiQueryConnection(list, undefined, "SQL を流せませんでした")?.id, 2);
});

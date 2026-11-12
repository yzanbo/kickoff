import assert from "node:assert/strict";
import { test } from "node:test";
import { reduceConnectedIds } from "./dbConnections";

test("つないでいる接続: 知らせで足す・外す。変わらない・ほかのプロジェクトの知らせでは同じ配列", () => {
  const ids = [1];
  const state = (connection_id: number, connected: boolean, project_id = 7) => ({ type: "db_connection_state" as const, project_id, connection_id, connected });
  assert.deepEqual(reduceConnectedIds(ids, state(2, true), 7), [1, 2]);
  assert.deepEqual(reduceConnectedIds(ids, state(1, false), 7), []);
  assert.equal(reduceConnectedIds(ids, state(1, true), 7), ids);
  assert.equal(reduceConnectedIds(ids, state(3, false), 7), ids);
  assert.equal(reduceConnectedIds(ids, state(2, true, 8), 7), ids);
  assert.equal(reduceConnectedIds(ids, { type: "db_connections", project_id: 7 }, 7), ids);
});

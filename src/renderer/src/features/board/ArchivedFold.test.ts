import assert from "node:assert/strict";
import { test } from "node:test";
import { splitArchived } from "./ArchivedFold";

test("splitArchived: アーカイブしていないものと、アーカイブ済みに分ける（それぞれ元の順のまま）", () => {
  const items = [
    { id: 1, archived_at: null },
    { id: 2, archived_at: "2026-01-01T00:00:00Z" },
    { id: 3, archived_at: null },
  ];
  const [active, archived] = splitArchived(items);
  assert.deepEqual(
    active.map((i) => i.id),
    [1, 3],
  );
  assert.deepEqual(
    archived.map((i) => i.id),
    [2],
  );
  assert.deepEqual(splitArchived([]), [[], []]);
});

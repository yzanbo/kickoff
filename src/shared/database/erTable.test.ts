import assert from "node:assert/strict";
import { test } from "vitest";
import type { DbTableDetail } from "./types";
import { erTableOf } from "./erTable";

const col = (name: string, opts: { pk?: boolean; type?: string } = {}) => ({ name, type: opts.type ?? "integer", nullable: false, primary_key: opts.pk ?? false });

test("erTableOf: 主キーと一意のインデックスを一意の組にし、列は名前・型・NULL・主キーだけ", () => {
  const detail: DbTableDetail = {
    kind: "table",
    columns: [
      { ...col("id", { pk: true }), default: null, comment: null },
      { ...col("email", { type: "text" }), default: null, comment: null },
    ],
    indexes: [
      { name: "pk", columns: ["id"], unique: true, primary: true },
      { name: "email_key", columns: ["email"], unique: true, primary: false },
      { name: "plain", columns: ["email"], unique: false, primary: false },
    ],
    foreign_keys: [],
    referenced_by: [],
    triggers: [],
    ddl: null,
    estimated_rows: null,
    size_bytes: null,
    comment: "利用者",
  };
  const t = erTableOf("users", detail);
  assert.deepEqual(t.unique_sets, [["id"], ["email"]]);
  assert.deepEqual(t.columns[1], { name: "email", type: "text", nullable: false, primary_key: false });
  assert.equal(t.comment, "利用者");
});

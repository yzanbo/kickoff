import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { onServerEvent, publishServerEvent } from "./events";

test("onServerEvent: 購読した種類の知らせだけが届く", () => {
  const got: string[] = [];
  onTestFinished(onServerEvent("project_deleted", (e) => got.push(`project ${e.id}`)));
  publishServerEvent({ type: "chat_deleted", id: 60, project_id: 6 });
  publishServerEvent({ type: "project_deleted", id: 32 });
  assert.deepEqual(got, ["project 32"]);
});

test("onServerEvent: 配列で複数の種類を購読でき、届いた順に呼ぶ", () => {
  const got: string[] = [];
  onTestFinished(onServerEvent(["project_deleted", "chat_deleted"], (e) => got.push(`${e.type} ${e.id}`)));
  publishServerEvent({ type: "chat_deleted", id: 60, project_id: 6 });
  publishServerEvent({ type: "project_deleted", id: 32 });
  publishServerEvent({ type: "snippet_deleted", id: 1 });
  assert.deepEqual(got, ["chat_deleted 60", "project_deleted 32"]);
});

test("onServerEvent: 返り値で外したら、どの種類も届かない", () => {
  const got: number[] = [];
  const off = onServerEvent(["project_deleted", "chat_deleted"], (e) => got.push(e.id));
  publishServerEvent({ type: "project_deleted", id: 1 });
  off();
  publishServerEvent({ type: "project_deleted", id: 2 });
  publishServerEvent({ type: "chat_deleted", id: 3, project_id: 6 });
  assert.deepEqual(got, [1]);
});

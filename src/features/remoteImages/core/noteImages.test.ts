// API のテスト: ノートの外の画像（表示を許可したホストはノートごと・許可したホストの画像だけ取る・ノートを動かすと付いていく・ゴミ箱に入れると忘れる）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { BusEvent } from "@shared/foundation/contract";
import { AUTH, setup } from "@/app/core/testing/testServer";
import { until } from "@/app/core/testing/testCore";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { createNoteImageStore } from "./db/noteImages";
import { NoteImageService } from "./noteImageService";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 4, 5, 6]);
const FEATURES = ["remoteImages", "notes", "settings", "trash"] as const;

const imageUrl = (projectId: number, note: string, url: string) => `/api/projects/${projectId}/note-remote-image?path=${encodeURIComponent(note)}&url=${encodeURIComponent(url)}`;

test("ノートの許可: ノートごとに覚え（ほかのノートでは許可していない）、変わるたびに note_image_hosts を知らせる", async () => {
  const { api, bus, project } = setup({ features: [...FEATURES] });
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const params = { projectId: project.id };
  assert.deepEqual((await api("GET /api/projects/:projectId/note-image-hosts", { params, query: { path: "a.md" } })).body, { hosts: [] });
  const allowed = await api("PUT /api/projects/:projectId/note-image-hosts", { params, body: { path: "a.md", host: "Images.Example.COM" } });
  assert.deepEqual(allowed.body.hosts.map((h: { host: string }) => h.host), ["images.example.com"]);
  assert.deepEqual((await api("GET /api/projects/:projectId/note-image-hosts", { params, query: { path: "b.md" } })).body, { hosts: [] });
  const changed = events.filter((e) => e.type === "note_image_hosts");
  assert.equal(changed.length, 1);
  assert.equal(changed[0].type === "note_image_hosts" && changed[0].path, "a.md");
  assert.deepEqual((await api("DELETE /api/projects/:projectId/note-image-hosts", { params, query: { path: "a.md", host: "images.example.com" } })).body, { hosts: [] });
  // ノートのフォルダの外・使えないホストの名前
  assert.equal((await api("PUT /api/projects/:projectId/note-image-hosts", { params, body: { path: "../外.md", host: "x.y" } })).status, 400);
  assert.equal((await api("PUT /api/projects/:projectId/note-image-hosts", { params, body: { path: "a.md", host: "a b" } })).status, 400);
});

test("ノートの画像: 許可したホストだけを取り、2 回目からは覚えた画像を返す", async () => {
  const { app, api, project, imageFake } = setup({ features: [...FEATURES] });
  const url = "https://images.example.com/n.png";
  imageFake.images[url] = { contentType: "image/png", body: PNG };
  const denied = await app.request(imageUrl(project.id, "a.md", url), { headers: AUTH });
  assert.equal(denied.status, 400);
  assert.match((await denied.json()).error, /このノートでは images\.example\.com の画像の表示を許可していません/);
  assert.deepEqual(imageFake.fetched, []);
  await api("PUT /api/projects/:projectId/note-image-hosts", { params: { projectId: project.id }, body: { path: "a.md", host: "images.example.com" } });
  const first = await app.request(imageUrl(project.id, "a.md", url), { headers: AUTH });
  assert.equal(first.status, 200);
  assert.deepEqual(Buffer.from(await first.arrayBuffer()), PNG);
  await app.request(imageUrl(project.id, "a.md", url), { headers: AUTH });
  assert.deepEqual(imageFake.fetched, [url]);
  // 同じプロジェクトでも、ほかのノートでは取らない
  assert.equal((await app.request(imageUrl(project.id, "b.md", url), { headers: AUTH })).status, 400);
});

test("ノートを動かすと許可と覚えた画像が付いていき（絵文字の名前のフォルダごとでも）、ゴミ箱に入れると忘れる", async () => {
  const { app, api, project, imageFake } = setup({ features: [...FEATURES] });
  const params = { projectId: project.id };
  const url = "https://images.example.com/m.png";
  imageFake.images[url] = { contentType: "image/png", body: PNG };
  await api("POST /api/projects/:projectId/notes", { params, body: { path: "📁dir", dir: true } });
  await api("POST /api/projects/:projectId/notes", { params, body: { path: "📁dir/a.md" } });
  await api("PUT /api/projects/:projectId/note-image-hosts", { params, body: { path: "📁dir/a.md", host: "images.example.com" } });
  await app.request(imageUrl(project.id, "📁dir/a.md", url), { headers: AUTH });

  assert.equal((await api("POST /api/projects/:projectId/notes/move", { params, body: { from: "📁dir", to: "moved" } })).status, 200);
  const hostsOf = async (note: string) => (await api("GET /api/projects/:projectId/note-image-hosts", { params, query: { path: note } })).body.hosts.length;
  await until(async () => (await hostsOf("moved/a.md")) === 1);
  assert.equal(await hostsOf("📁dir/a.md"), 0);
  // 覚えた画像も付いていく（取り直さない）
  assert.equal((await app.request(imageUrl(project.id, "moved/a.md", url), { headers: AUTH })).status, 200);
  assert.deepEqual(imageFake.fetched, [url]);

  assert.equal((await api("DELETE /api/projects/:projectId/note", { params, query: { path: "moved/a.md" } })).status, 200);
  await until(async () => (await hostsOf("moved/a.md")) === 0);
});

test("ノートの範囲: 動かした先に古い範囲が残っていれば先に消し、ファイルだけ残った範囲は起動したときに片付ける", async () => {
  const dir = tempDir();
  const { store, project } = setup({ features: [...FEATURES] });
  const notes = createNoteImageStore(store.db);
  const service = new NoteImageService({ store: notes, dir, publish: () => {} });
  const stale = notes.scope(project.id, "b.md", true)!;
  const scope = notes.scope(project.id, "a.md", true)!;
  notes.allow(scope, "x.example");
  fs.mkdirSync(path.join(dir, String(stale)));
  await service.moved(project.id, "a.md", project.id, "b.md");
  assert.equal(notes.scope(project.id, "b.md"), scope);
  assert.deepEqual(notes.hosts(scope).map((h) => h.host), ["x.example"]);
  assert.equal(fs.existsSync(path.join(dir, String(stale))), false);
  // 行のない範囲のフォルダ（プロジェクトを本当に消したあと）だけを消す
  fs.mkdirSync(path.join(dir, String(scope)));
  fs.mkdirSync(path.join(dir, "9999"));
  await service.sweep();
  assert.deepEqual(fs.readdirSync(dir), [String(scope)]);
});

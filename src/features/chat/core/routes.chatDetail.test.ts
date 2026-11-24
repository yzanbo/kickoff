// API のテスト: チャットの記録（詳細の記録・tail_turns・/events・/texts・書きかけの返答・やり取りの記録・ツールの結果の画像・フィード）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { AUTH, setup, until } from "@/app/core/testing/testServer";
import { tempDir } from "@/foundation/core/testing/tempDir";

test("チャットの記録の API: ほかのチャットのやり取りを Markdown の添付ファイルにして返す（そのまま添付として送れる）", async () => {
  const { call, api, project, store, provider } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const source = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "前の話" } })).body.id;
  await until(() => store.chats.get(source)?.status === "completed");
  const res = await call("POST", `/api/chats/${source}/transcript`);
  assert.equal(res.status, 201);
  assert.equal(res.body.mime, "text/markdown");
  assert.match(res.body.name, /^チャット履歴-.+\.md$/);
  // 別のチャットに添付として送ると、指示に記録のファイルのパスが添えられる
  const target = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "続き", attachments: [res.body] } })).body.id;
  await until(() => store.chats.get(target)?.status === "completed");
  assert.match(provider.prompts.at(-1)!, /チャット履歴-.+\.md/);
  assert.equal((await call("POST", "/api/chats/99999/transcript")).status, 404);
});

test("チャットのやり取りの記録の API: 全部のやり取りを Markdown で返す（コピー用。断り書きは入れない）", async () => {
  const { api, project, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const id = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "前の話" } })).body.id;
  await until(() => store.chats.get(id)?.status === "completed");
  const res = await api("GET /api/chats/:chatId/transcript", { params: { chatId: id } });
  assert.equal(res.status, 200);
  assert.match(res.body.markdown, /^# チャット「.*」の記録/);
  assert.match(res.body.markdown, /## 自分（.+）\n\n前の話/);
  assert.doesNotMatch(res.body.markdown, /参照のために書き出したもの/);
  assert.equal((await api("GET /api/chats/:chatId/transcript", { params: { chatId: 99999 } })).status, 404);
});

test("ツールの結果の画像: 作業場所などの中の画像だけを、いまの中身と最後に変えた時刻で返す", async () => {
  const { app, project, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "画像", status: "completed" });
  const file = path.join(project.repo_path, "画面.png");
  fs.writeFileSync(file, new Uint8Array([137, 80, 78, 71]));
  const outside = path.join(tempDir(), "外.png");
  fs.writeFileSync(outside, new Uint8Array([1]));
  const get = (p: string, id = chat.id) => app.request(`/api/chats/${id}/tool-image?path=${encodeURIComponent(p)}`, { headers: AUTH });

  const ok = await get(file);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.equal(ok.headers.get("content-security-policy"), "sandbox");
  assert.equal(Number(ok.headers.get("x-file-mtime")), Math.floor(fs.statSync(file).mtimeMs));
  assert.deepEqual([...new Uint8Array(await ok.arrayBuffer())], [137, 80, 78, 71]);
  // 外・画像でない・パスなしは 400、ないファイル・ないチャットは 404、トークンなしは 401
  assert.equal((await get(outside)).status, 400);
  assert.equal((await get(path.join(project.repo_path, "a.txt"))).status, 400);
  assert.equal((await app.request(`/api/chats/${chat.id}/tool-image`, { headers: AUTH })).status, 400);
  assert.equal((await get(path.join(project.repo_path, "ない.png"))).status, 404);
  assert.equal((await get(file, 9999)).status, 404);
  assert.equal((await app.request(`/api/chats/${chat.id}/tool-image?path=${encodeURIComponent(file)}`)).status, 401);
});

test("フィード: チャットごとにメインエージェントの最新の返答 1 件（子チャット・ノートのチャット・サブエージェントの返答は除く）を、返答の新しい順に返す", async () => {
  const { call, api, project, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const a = store.chats.create({ project_id: project.id, provider: "claude", title: "a", status: "completed" });
  const b = store.chats.create({ project_id: project.id, provider: "claude", title: "b", status: "completed" });
  const quiet = store.chats.create({ project_id: project.id, provider: "claude", title: "まだ返答なし", status: "completed" });
  const child = store.chats.create({ project_id: project.id, provider: "claude", title: "子", status: "completed", parent_chat_id: a.id });
  const note = store.chats.create({ project_id: project.id, provider: "claude", title: "ノート", status: "completed", note_path: "m.md" });
  store.events.add(a.id, { type: "user", text: "質問", message_uuid: randomUUID() });
  store.events.add(a.id, { type: "text", text: "古い返答" });
  store.events.add(b.id, { type: "text", text: "b の返答" });
  const latest = store.events.add(a.id, { type: "text", text: `  新しい返答${"あ".repeat(500)}  ` });
  // サブエージェントの返答・結果は載せない
  store.events.add(a.id, { type: "text", text: "サブエージェントの返答", parent: "tool-1" });
  store.events.add(child.id, { type: "text", text: "子の返答" });
  store.events.add(note.id, { type: "text", text: "ノートの返答" });
  store.events.add(quiet.id, { type: "user", text: "送っただけ", message_uuid: randomUUID() });

  const items = (await api("GET /api/feed")).body as { chat_id: number; event_id: number; text: string }[];
  assert.deepEqual(
    items.map((i) => i.chat_id),
    [a.id, b.id],
  );
  assert.equal(items[0].event_id, latest.id);
  // 前後の空白を除き、FEED_TEXT_LIMIT（400）文字で切って … を付ける
  assert.ok(items[0].text.startsWith("新しい返答"));
  assert.equal(items[0].text.length, 401);
  assert.ok(items[0].text.endsWith("…"));
  assert.equal(items[1].text, "b の返答");
  assert.equal((await call("GET", "/api/feed?limit=1")).body.length, 1);
});

test("チャットの詳細の記録: クエリがなければすべて・after でそれより新しい分・limit で終わりから・before と limit でさかのぼる。after の記録が消えていれば after_missing", async () => {
  const { call, api, project, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "長い", status: "completed" });
  const ids = Array.from({ length: 6 }, (_, i) => store.events.add(chat.id, { type: "text", text: `返答${i}` }).id);
  type Detail = { events: { id: number }[]; has_earlier: boolean; after_missing: boolean };
  const get = async (q = "") => (await call("GET", `/api/chats/${chat.id}${q}`)).body as Detail;
  const idsOf = (d: Detail) => d.events.map((e) => e.id);

  const all = await get();
  assert.deepEqual(idsOf(all), ids);
  assert.deepEqual([all.has_earlier, all.after_missing], [false, false]);
  assert.deepEqual(idsOf(await get(`?after=${ids[3]}`)), ids.slice(4));
  const tail = await get("?limit=2");
  assert.deepEqual([idsOf(tail), tail.has_earlier], [ids.slice(4), true]);
  const page = await get(`?before=${ids[2]}&limit=5`);
  assert.deepEqual([idsOf(page), page.has_earlier], [ids.slice(0, 2), false]);
  assert.deepEqual(idsOf(await get(`?before=${ids[4]}&limit=2`)), ids.slice(2, 4));

  // 巻き戻しで消えた記録を after に渡したら、読み直すよう知らせる
  store.events.deleteFrom(chat.id, ids[4]);
  const missing = await get(`?after=${ids[5]}`);
  assert.deepEqual([idsOf(missing), missing.after_missing], [[], true]);
  // ほかのチャットの記録も同じ（そのチャットのものではない）
  const other = store.chats.create({ project_id: project.id, provider: "claude", title: "別", status: "completed" });
  assert.equal(((await api("GET /api/chats/:chatId", { params: { chatId: other.id }, query: { after: ids[0] } })).body).after_missing, true);

  // 組み合わせを間違えたら 400
  for (const q of [`?after=${ids[0]}&limit=2`, `?after=${ids[0]}&before=${ids[1]}`, `?before=${ids[1]}`, "?limit=0", "?after=abc"]) {
    assert.equal((await call("GET", `/api/chats/${chat.id}${q}`)).status, 400, q);
  }
});

test("チャットの詳細の tail_turns: 末尾をターン（作業の終わりを境目）で数えて読み、その前は索引で返す。ほかのクエリと一緒なら 400", async () => {
  const { call, project, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "長い", status: "completed" });
  const ends: number[] = [];
  const firsts: number[] = [];
  for (let n = 0; n < 4; n++) {
    firsts.push(store.events.add(chat.id, { type: "user", text: `指示${n}`, message_uuid: `u${n}` }).id);
    store.events.add(chat.id, { type: "tool_use", id: `c${n}`, name: n === 0 ? "TodoWrite" : "Bash", input: { todos: [] } });
    store.events.add(chat.id, { type: "text", text: `返答${n}` });
    ends.push(store.events.add(chat.id, { type: "result", status: "completed", text: `写し${n}` }).id);
  }
  type Detail = { events: { id: number }[]; index: { id: number; type: string; data: Record<string, unknown> }[]; has_earlier: boolean; head_partial: boolean };
  const d = (await call("GET", `/api/chats/${chat.id}?tail_turns=2`)).body as Detail;
  assert.equal(d.events[0].id, firsts[2]);
  assert.deepEqual([d.has_earlier, d.head_partial], [true, false]);
  // 索引: 自分の発言・作業の終わり（成功した返答の写しは外す）・TodoWrite。メインの Bash と返答の文は入れない
  assert.deepEqual(d.index.map((e) => e.type), ["user", "tool_use", "result", "user", "result"]);
  assert.equal("text" in d.index[2].data, false);
  // 短いチャットは索引が空
  const short = (await call("GET", `/api/chats/${chat.id}?tail_turns=10`)).body as Detail;
  assert.deepEqual([short.events.length, short.index, short.has_earlier], [16, [], false]);
  // クエリなし・limit・after はいまのまま（スマホの互換。索引は返さない）
  assert.equal(((await call("GET", `/api/chats/${chat.id}?limit=2`)).body as Detail).index, undefined);
  for (const q of ["?tail_turns=2&limit=2", `?tail_turns=2&after=${ends[0]}`, "?tail_turns=0"]) {
    assert.equal((await call("GET", `/api/chats/${chat.id}${q}`)).status, 400, q);
  }
});

test("記録の一部分（/events）の 5 つの形と、検索の本文（/texts）。誤った組み合わせは 400", async () => {
  const { call, api, project, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "長い", status: "completed" });
  const ends: number[] = [];
  for (let n = 0; n < 5; n++) {
    store.events.add(chat.id, { type: "user", text: `指示${n}`, message_uuid: `u${n}` });
    store.events.add(chat.id, { type: "text", text: `返答${n}` });
    store.events.add(chat.id, { type: "text", text: `中${n}`, parent: "agent" });
    ends.push(store.events.add(chat.id, { type: "result", status: "completed" }).id);
  }
  type Page = { events: { id: number }[]; has_earlier: boolean; has_later: boolean; head_partial: boolean };
  const get = async (q: string) => (await call("GET", `/api/chats/${chat.id}/events${q}`)).body as Page;
  const before = await get(`?before=${ends[3] + 1}&turns=2`);
  assert.deepEqual([before.events[0].id, before.events.at(-1)!.id, before.has_earlier], [ends[1] + 1, ends[3], true]);
  assert.deepEqual((await get(`?before=${ends[1] + 1}&since=${ends[0] + 1}`)).events.map((e) => e.id), [ends[0] + 1, ends[0] + 2, ends[0] + 3, ends[1]]);
  const around = await get(`?around=${ends[2] - 1}&turns=2&until=${ends[4]}`);
  assert.deepEqual([around.events[0].id, around.events.at(-1)!.id, around.has_later], [ends[0] + 1, ends[2], true]);
  const after = await get(`?after=${ends[2]}&turns=3&until=${ends[4] - 3}`);
  assert.deepEqual([after.events.at(-1)!.id, after.has_later], [ends[3], false]);
  assert.equal((await get(`?parents=agent&before=${ends[2]}`)).events.length, 3);
  for (const q of ["", `?before=${ends[2]}`, `?before=${ends[2]}&turns=2&since=1`, "?around=abc&turns=2", `?parents=agent`]) {
    assert.equal((await call("GET", `/api/chats/${chat.id}/events${q}`)).status, 400, q);
  }
  // 検索の本文: before より前の自分の発言とメインの返答だけ（サブエージェントの文は入れない）
  const texts = (await api("GET /api/chats/:chatId/texts", { params: { chatId: chat.id }, query: { before: ends[1] } })).body as { events: { type: string; data: { text: string } }[] };
  assert.deepEqual(texts.events.map((e) => e.data.text), ["指示0", "返答0", "指示1", "返答1"]);
  assert.equal((await call("GET", `/api/chats/${chat.id}/texts`)).status, 400);
});

test("チャットの詳細に書きかけの返答（SSE で流した途中の文をつないだもの）と長さが入り、確定したら null になる", async () => {
  const { api, project, store, bus, runner } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "こんにちは" } })).body.id;
  await until(() => !runner.isBusy(chatId));
  assert.equal((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.streaming_text, null);
  // 返答の途中で開いた: それまでに流した途中の文が頭から入る（流す chat_delta には書きかけの文の中の位置が付く）
  const seen: number[] = [];
  bus.subscribe((e) => e.type === "chat_delta" && e.chat_id === chatId && seen.push(e.offset ?? -1));
  bus.publish({ type: "chat_delta", project_id: project.id, chat_id: chatId, text: "返答の" });
  bus.flush();
  bus.publish({ type: "chat_delta", project_id: project.id, chat_id: chatId, text: "途中" });
  bus.flush();
  assert.deepEqual(seen, [0, 3]);
  const middle = (await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body;
  assert.equal(middle.streaming_text, "返答の途中");
  assert.equal(middle.streaming_length, 5);
  // メインエージェントの確定した文の記録で消える（記録に全文がある）
  store.events.add(chatId, { type: "text", text: "返答の途中です" });
  const done = (await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body;
  assert.equal(done.streaming_text, null);
  assert.equal(done.streaming_length, 0);
});


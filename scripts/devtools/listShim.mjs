// 長い一覧の確かめと測る道具が使う、画面の fetch の差し替え（GET /api/chats に偽のチャットを、グループの一覧に偽のグループを足す）。
// チャットは DB に足さない（API で作ると AI に送るため）。CDP の Page.addScriptToEvaluateOnNewDocument に渡し、読み込み直してから使う。
// 使うのは scripts/perf/lists.mjs（測る）と scripts/e2e/scenarios/sidebar-*.mjs・board-find.mjs（通しの確かめ）

/** 偽のチャットとグループを足す fetch の差し替え（読み込む前の画面で動く文） */
export function shimSource({ template, projectId, count, groups }) {
  return `(() => {
  const template = ${JSON.stringify(template)};
  const projectId = ${projectId}, count = ${count}, groupCount = ${groups};
  const groups = Array.from({ length: groupCount }, (_, i) => ({ id: 990001 + i, project_id: projectId, name: "測るグループ " + (i + 1), hue: (i * 47) % 360, position: 100 + i, created_at: "2026-11-01T00:00:00.000Z" }));
  const base = Date.parse("2026-11-10T00:00:00.000Z");
  const chats = Array.from({ length: count }, (_, i) => ({
    ...template,
    id: 900001 + i,
    project_id: projectId,
    title: "測るチャット " + (i + 1) + (i % 3 === 0 ? " の少し長めの名前（折り返さない幅を確かめる）" : ""),
    group_id: groupCount && i % 10 < 7 ? groups[i % groupCount].id : null,
    worktree_path: i % 2 ? "/tmp/perf-worktree-" + (i % 5) : null,
    branch: i % 2 ? "perf-" + (i % 5) : "main",
    status: i % 17 === 0 ? "failed" : "completed",
    error: null,
    unread: i % 4 === 0,
    pinned: false,
    session_id: null,
    position: null,
    // 型にしたチャットがノートのチャット・子チャット・アーカイブ済みでも、ふつうのチャットとして並べる
    note_path: null,
    parent_chat_id: null,
    parent_event_id: null,
    archived_at: null,
    active_at: new Date(base - i * 60000).toISOString(),
    created_at: new Date(base - i * 60000 - 3600000).toISOString(),
    turn_started_at: new Date(base - i * 60000 - 60000).toISOString(),
  }));
  window.__perfFake = { chats: count, groups: groupCount };
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const res = await orig(input, init);
    if (method !== "GET" || !res.ok) return res;
    const path = new URL(url, location.href).pathname + new URL(url, location.href).search;
    let extra = null;
    if (/^\\/api\\/chats$/.test(path)) extra = chats;
    else if (path === "/api/projects/" + projectId + "/groups") extra = groups;
    if (!extra) return res;
    const body = await res.json();
    return new Response(JSON.stringify([...body, ...extra]), { status: 200, headers: { "content-type": "application/json" } });
  };
})();`;
}

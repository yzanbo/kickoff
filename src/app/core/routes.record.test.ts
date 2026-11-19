import { test } from "vitest";
import { setup } from "@/app/core/testing/testServer";
import { matchRecord } from "@/foundation/core/testing/record";
import { deviceRoutes } from "@/foundation/core/http/deviceAccess";

test("全ルートのメソッドとパスと、端末に開くかの記録（取り決めへの乗せ替えでも変わらない）", async () => {
  const { app, routes } = setup();
  const access = new Map(deviceRoutes(routes).map((r) => [`${r.method} ${r.path}`, r.access]));
  // ミドルウェア（app.use）と同じ ALL は数えない
  const rows = [...new Set(app.routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`))].sort().map((route) => {
    const open = access.get(route);
    return { route, device: open === "deviceRead" ? "read" : open === "device" ? "full" : "none" };
  });
  await matchRecord("core/routes.json", rows);
});

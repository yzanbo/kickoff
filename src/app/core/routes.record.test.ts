import { test } from "vitest";
import { setup } from "@/app/core/testing/testServer";
import { matchRecord } from "@/foundation/core/testing/record";
import { DEVICE_ROUTES, READ_ONLY_DEVICE_ROUTES } from "@/foundation/core/http/deviceAccess";

test("全ルートのメソッドとパスと、端末に開くかの記録（取り決めへの乗せ替えでも変わらない）", async () => {
  const { app } = setup();
  const has = (list: readonly (readonly [string, string])[], m: string, p: string) => list.some(([lm, lp]) => lm === m && lp === p);
  // ミドルウェア（app.use）と同じ ALL は数えない
  const rows = [...new Set(app.routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`))]
    .sort()
    .map((route) => {
      const [m, p] = route.split(" ");
      return { route, device: has(READ_ONLY_DEVICE_ROUTES, m, p) ? "read" : has(DEVICE_ROUTES, m, p) ? "full" : "none" };
    });
  await matchRecord("core/routes.json", rows);
});

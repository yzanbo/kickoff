import { test } from "vitest";
import { setup } from "@/app/core/testing/testServer";
import { matchRecord } from "@/foundation/core/testing/record";
import { deviceRoutes } from "@/foundation/core/http/deviceAccess";

/**
 * 取り決めで意味のある名前にしたパスの引数の、前の名前（Hono のパターンの名前だけで URL は変わらないので、記録は前の名前で書く）。
 * 乗せ替えで引数の名前を付け替えたら、ここに 1 行足す（足さずに名前が変わると記録が落ちる）
 */
const RENAMED_PARAMS: Readonly<Record<string, string>> = { snippetId: "id" };

const recorded = (path: string) => path.replace(/:([A-Za-z]+)/g, (whole, name: string) => (RENAMED_PARAMS[name] ? `:${RENAMED_PARAMS[name]}` : whole));

test("全ルートのメソッドとパスと、端末に開くかの記録（取り決めへの乗せ替えでも変わらない）", async () => {
  const { app, routes } = setup();
  const access = new Map(deviceRoutes(routes).map((r) => [`${r.method} ${r.path}`, r.access]));
  // ミドルウェア（app.use）と同じ ALL は数えない
  const rows = [...new Set(app.routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`))]
    .map((route) => {
      const open = access.get(route);
      const [method, path] = route.split(" ");
      return { route: `${method} ${recorded(path)}`, device: open === "deviceRead" ? "read" : open === "device" ? "full" : "none" };
    })
    .sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));
  await matchRecord("core/routes.json", rows);
});

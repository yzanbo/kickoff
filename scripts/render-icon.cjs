// SVG を透明な背景のまま PNG に描く（Electron の画面で描いて撮る）。build-icon.mjs から呼ぶ: electron render-icon.cjs <in.svg> <out.png> <size>
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const [input, output, sizeArg] = process.argv.slice(2);
const size = Number(sizeArg ?? 1024);
app.dock?.hide();
process.on("unhandledRejection", (e) => { console.error(e); app.exit(1); });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: size, height: size, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  win.webContents.setZoomFactor(1);
  const svg = fs.readFileSync(input, "utf8").replace(/width="1024" height="1024"/, `width="${size}" height="${size}"`);
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  fs.writeFileSync(output, image.resize({ width: size, height: size }).toPNG());
  app.exit(0);
});

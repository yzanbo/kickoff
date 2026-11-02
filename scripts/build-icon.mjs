// build/icon.svg・icon-dev.svg から、アプリのアイコン（build/icon.png・icon.icns と開発版の icon-dev.png・icon-dev.icns）を作り直す: npm run icon
// macOS 専用（sips と iconutil を使う）。描くのは Electron（scripts/render-icon.cjs）
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import electron from "electron";

const root = path.join(import.meta.dirname, "..");
/** 本番（icon）と開発版（icon-dev。npm run dev の Electron.app に当てる）のアイコンを作る */
function buildIcon(name) {
  const svg = path.join(root, "build", `${name}.svg`);
  const png = path.join(root, "build", `${name}.png`);
  const icns = path.join(root, "build", `${name}.icns`);
  execFileSync(String(electron), [path.join(import.meta.dirname, "render-icon.cjs"), svg, png, "1024"], { stdio: "inherit" });

  // iconutil が求める大きさをそろえる（@2x は倍の大きさ）
  const work = mkdtempSync(path.join(tmpdir(), "kickoff-icon-"));
  const iconset = path.join(work, "icon.iconset");
  execFileSync("mkdir", [iconset]);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const file = scale === 1 ? `icon_${size}x${size}.png` : `icon_${size}x${size}@2x.png`;
      const px = String(size * scale);
      execFileSync("sips", ["-z", px, px, png, "--out", path.join(iconset, file)], { stdio: "ignore" });
    }
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", icns]);
  rmSync(work, { recursive: true, force: true });
  console.log(`アイコンを作りました: ${path.relative(root, png)} / ${path.relative(root, icns)}`);
}

buildIcon("icon");
buildIcon("icon-dev");

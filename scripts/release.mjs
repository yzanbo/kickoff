// 配る手順（npm run publish）の純粋な決まり: タグの名前・β 版か・版の一覧の書き換え・fuses の確かめ
import { parse, stringify } from "yaml";

/** semver の版（0.1.0・0.1.0-beta.1） */
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** 版のタグ（v0.1.0-beta.1）。semver でなければ止める */
export function releaseTagOf(version) {
  if (!SEMVER.test(version)) throw new Error(`package.json の version が semver ではありません（${version}）`);
  return `v${version}`;
}

/** β 版などの先行版か（Releases にプレリリースの印を付ける） */
export const isPrerelease = (version) => SEMVER.exec(version)?.[4] !== undefined;

/** Releases に置いたファイルの URL（GitHub はファイル名の空白を . に替えるので、空白のある名前は止める） */
export function releaseAssetUrl(repo, tag, file) {
  if (/\s/.test(file)) throw new Error(`Releases に置くファイルの名前に空白があります（${file}）`);
  return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(file)}`;
}

/**
 * electron-builder が作った版の一覧（latest-mac.yml）の zip・dmg の場所を、Releases の URL に書き換える。
 * 一覧は GitHub Pages、本体は Releases に置くため（そのままでは一覧の場所からの相対パスになり、Pages に本体がないので落ちる）
 */
export function rewriteLatestMac(text, { repo, tag }) {
  const info = parse(text);
  if (!info?.version || !Array.isArray(info.files) || info.files.length === 0) throw new Error("latest-mac.yml の形が違います（version・files がありません）");
  const absolute = (url) => (/^https?:\/\//.test(url) ? url : releaseAssetUrl(repo, tag, url));
  info.files = info.files.map((f) => ({ ...f, url: absolute(f.url) }));
  if (info.path) info.path = absolute(info.path);
  return stringify(info);
}

/**
 * @electron/fuses read の出力が electron-builder.yml の electronFuses どおりか（違えば理由の文。合っていれば null）。
 * yml の名前（runAsNode）は、出力の名前（RunAsNode）の頭を小文字にしたもの
 */
export function fusesProblem(output, electronFuses) {
  const actual = Object.fromEntries([...output.matchAll(/^\s*(\w+) is (Enabled|Disabled|Removed)/gm)].map((m) => [m[1], m[2]]));
  const expected = Object.entries(electronFuses ?? {}).map(([key, on]) => [key[0].toUpperCase() + key.slice(1), on ? "Enabled" : "Disabled"]);
  if (expected.length === 0) return "electron-builder.yml に electronFuses がありません";
  const wrong = expected.filter(([name, state]) => actual[name] !== state);
  return wrong.length === 0 ? null : `fuses が違います: ${wrong.map(([name, state]) => `${name}（${actual[name] ?? "なし"}。期待: ${state}）`).join("・")}`;
}

/** 作業場所の変更（status --porcelain の出力）がなければ null、あれば止める理由 */
export function dirtyProblem(porcelain) {
  const lines = porcelain.split("\n").filter(Boolean);
  return lines.length === 0 ? null : `コミットしていない変更があります（${lines.length} 件）。コミットしてから配ってください`;
}

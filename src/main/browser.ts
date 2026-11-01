import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app, session, shell, type Session, type WebContents } from "electron";
import { unpackCrx } from "./crx.js";

const execFileAsync = promisify(execFile);

/** 埋め込みブラウザ用のセッション（ログイン状態は保持するが、Kickoff 本体とは分ける） */
export const BROWSER_PARTITION = "persist:kickoff-browser";

/** よく使う拡張機能の Chrome ウェブストア ID */
export const KNOWN_EXTENSIONS = {
  "react-devtools": { id: "fmkadmapgofadopljbjfkapdkoienihi", name: "React Developer Tools" },
} as const;

export interface BrowserExtensionInfo {
  name: string;
  version: string;
  path: string;
  source: "webstore" | "chrome-profile" | "folder";
}

const extensionsDir = () => path.join(app.getPath("userData"), "browser-extensions");
const manualListFile = () => path.join(app.getPath("userData"), "browser-extensions.json");
const browserSession = (): Session => session.fromPartition(BROWSER_PARTITION);

/**
 * 埋め込みブラウザ（<webview>）の安全設定。表示するページは信頼しない外部コンテンツとして扱う:
 * Node.js を使わせない、preload を差し込ませない、http(s) 以外は開かない、専用のセッションに限る。
 */
export function hardenWebviews() {
  app.on("web-contents-created", (_e, contents: WebContents) => {
    contents.on("will-attach-webview", (event, webPreferences, params) => {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      params.partition = BROWSER_PARTITION;
      if (params.src && !/^(https?:|about:blank)/.test(params.src)) event.preventDefault();
    });
    // 埋め込みブラウザ内の新しいウィンドウは、外部のブラウザで開く
    if (contents.getType() === "webview") {
      contents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) void shell.openExternal(url);
        return { action: "deny" };
      });
    }
  });
}

/** Chrome がインストールされていれば Chrome で、なければ既定のブラウザで開く */
export async function openInChrome(url: string) {
  if (!/^https?:\/\//.test(url)) return;
  try {
    await execFileAsync("open", ["-a", "Google Chrome", url]);
  } catch {
    await shell.openExternal(url);
  }
}

/** 起動時: 保存済みの拡張機能を埋め込みブラウザのセッションに読み込む（Electron は毎回読み込みが必要） */
export async function loadSavedExtensions(): Promise<string[]> {
  const errors: string[] = [];
  for (const dir of await listExtensionDirs()) {
    try {
      await browserSession().extensions.loadExtension(dir, { allowFileAccess: true });
    } catch (e) {
      errors.push(`${dir}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return errors;
}

export async function listExtensions(): Promise<BrowserExtensionInfo[]> {
  const loaded = browserSession().extensions.getAllExtensions();
  const manual = await readManualList();
  return loaded.map((ext) => ({
    name: ext.name,
    version: ext.version,
    path: ext.path,
    source: manual.includes(ext.path) ? "folder" : ext.path.includes(`${path.sep}chrome-`) ? "chrome-profile" : "webstore",
  }));
}

/** Chrome ウェブストアから拡張機能（.crx）を取得して展開し、読み込む */
export async function installFromWebStore(key: keyof typeof KNOWN_EXTENSIONS): Promise<BrowserExtensionInfo[]> {
  const { id } = KNOWN_EXTENSIONS[key];
  const url =
    `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3` +
    `&prodversion=${process.versions.chrome}&x=id%3D${id}%26installsource%3Dondemand%26uc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`拡張機能をダウンロードできませんでした（HTTP ${res.status}）`);
  const crx = Buffer.from(await res.arrayBuffer());
  const target = path.join(extensionsDir(), key);
  await unpackCrx(crx, target);
  await reload(target);
  return listExtensions();
}

/** Chrome のプロフィールにインストール済みの拡張機能を探して、コピーしてから読み込む */
export async function importFromChrome(key: keyof typeof KNOWN_EXTENSIONS): Promise<BrowserExtensionInfo[]> {
  const { id } = KNOWN_EXTENSIONS[key];
  const chromeDir = path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
  const profiles = await fs.readdir(chromeDir).catch(() => {
    throw new Error("Chrome のフォルダを読めませんでした（macOS の権限で拒否された可能性があります）。ウェブストアから取得してください");
  });
  for (const profile of profiles) {
    const base = path.join(chromeDir, profile, "Extensions", id);
    const versions = await fs.readdir(base).catch(() => [] as string[]);
    const latest = versions.sort().at(-1);
    if (!latest) continue;
    const target = path.join(extensionsDir(), `chrome-${key}`);
    await fs.rm(target, { recursive: true, force: true });
    // Chrome 専用のメタデータ（_metadata）は Electron が読み込みを拒否するので除く
    await fs.cp(path.join(base, latest), target, { recursive: true, filter: (src) => path.basename(src) !== "_metadata" });
    await reload(target);
    return listExtensions();
  }
  throw new Error("Chrome にこの拡張機能が見つかりませんでした");
}

/** 展開済みの拡張機能のフォルダを指定して読み込む */
export async function addExtensionFolder(dir: string): Promise<BrowserExtensionInfo[]> {
  await fs.access(path.join(dir, "manifest.json")).catch(() => {
    throw new Error("manifest.json があるフォルダ（展開済みの拡張機能）を選んでください");
  });
  await browserSession().extensions.loadExtension(dir, { allowFileAccess: true });
  const manual = await readManualList();
  if (!manual.includes(dir)) await fs.writeFile(manualListFile(), JSON.stringify([...manual, dir], null, 2));
  return listExtensions();
}

export async function removeExtension(extPath: string): Promise<BrowserExtensionInfo[]> {
  const ext = browserSession()
    .extensions.getAllExtensions()
    .find((e) => e.path === extPath);
  if (ext) browserSession().extensions.removeExtension(ext.id);
  const manual = await readManualList();
  if (manual.includes(extPath)) {
    await fs.writeFile(manualListFile(), JSON.stringify(manual.filter((p) => p !== extPath), null, 2));
  } else if (extPath.startsWith(extensionsDir())) {
    await fs.rm(extPath, { recursive: true, force: true });
  }
  return listExtensions();
}

async function reload(dir: string) {
  const s = browserSession();
  const old = s.extensions.getAllExtensions().find((e) => e.path === dir);
  if (old) s.extensions.removeExtension(old.id);
  await s.extensions.loadExtension(dir, { allowFileAccess: true });
}

async function listExtensionDirs(): Promise<string[]> {
  const managed = (await fs.readdir(extensionsDir()).catch(() => [] as string[])).map((d) => path.join(extensionsDir(), d));
  return [...managed, ...(await readManualList())];
}

async function readManualList(): Promise<string[]> {
  try {
    const v = JSON.parse(await fs.readFile(manualListFile(), "utf8"));
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

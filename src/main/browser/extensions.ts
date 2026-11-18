import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import { errorMessage } from "@shared/errors";
import { KNOWN_EXTENSION_KEYS, KNOWN_EXTENSIONS, type BrowserExtensionInfo, type KnownExtensionKey } from "@shared/ipc";
import { pickPaths } from "../app/dialogs.js";
import type { IpcHandlers } from "../ipc/register.js";
import { browserSession } from "./browser.js";
import { unpackCrx } from "./crx.js";
import { extensionOrigin, isManagedExtensionDir, knownExtensionDir } from "./extensionDirs.js";

// 埋め込みブラウザの拡張機能（React DevTools など）: ウェブストアから取る・Chrome から写す・展開済みのフォルダを読む

const extensionsDir = () => path.join(app.getPath("userData"), "browser-extensions");
const manualListFile = () => path.join(app.getPath("userData"), "browser-extensions.json");

/** 起動時に読み込めなかった拡張機能のフォルダと理由（一覧に出して、消せるようにする） */
const loadErrors = new Map<string, string>();

/** 起動時: 保存済みの拡張機能を埋め込みブラウザのセッションに読み込む（Electron は毎回読み込みが必要） */
export async function loadSavedExtensions(): Promise<string[]> {
  const errors: string[] = [];
  for (const dir of await listExtensionDirs()) {
    try {
      await browserSession().extensions.loadExtension(dir, { allowFileAccess: true });
      loadErrors.delete(dir);
    } catch (e) {
      loadErrors.set(dir, errorMessage(e));
      errors.push(`${dir}: ${errorMessage(e)}`);
    }
  }
  return errors;
}

/** 保存してある拡張機能の一覧（読み込めたものと、読み込めなかったもの） */
async function listExtensions(): Promise<BrowserExtensionInfo[]> {
  const root = extensionsDir();
  const loaded = browserSession().extensions.getAllExtensions();
  const loadedPaths = new Set(loaded.map((ext) => path.resolve(ext.path)));
  const list: BrowserExtensionInfo[] = loaded.map((ext) => ({
    name: ext.name,
    version: ext.version,
    path: ext.path,
    ...extensionOrigin(root, ext.path),
    error: null,
  }));
  for (const dir of await listExtensionDirs()) {
    if (loadedPaths.has(path.resolve(dir))) continue;
    const origin = extensionOrigin(root, dir);
    list.push({
      name: origin.key ? KNOWN_EXTENSIONS[origin.key].name : path.basename(dir),
      version: null,
      path: dir,
      ...origin,
      error: loadErrors.get(dir) ?? "読み込めていません",
    });
  }
  // よく使う拡張機能を一覧の順に、そのあとにほかのもの（Electron が返す順は決まっていないので）
  const rank = (e: BrowserExtensionInfo) => (e.key ? KNOWN_EXTENSION_KEYS.indexOf(e.key) : KNOWN_EXTENSION_KEYS.length);
  return list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Chrome ウェブストアから拡張機能（.crx）を取得して展開し、読み込む */
async function installFromWebStore(key: KnownExtensionKey): Promise<BrowserExtensionInfo[]> {
  const { id } = KNOWN_EXTENSIONS[key];
  const url =
    `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3` +
    `&prodversion=${process.versions.chrome}&x=id%3D${id}%26installsource%3Dondemand%26uc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`拡張機能をダウンロードできませんでした（HTTP ${res.status}）`);
  const crx = Buffer.from(await res.arrayBuffer());
  const target = knownExtensionDir(extensionsDir(), key, "webstore");
  await unpackCrx(crx, target);
  await reload(target);
  // Chrome から写した同じ拡張機能があれば消す（同じパネルが 2 つ出ないように）
  await deleteManaged(knownExtensionDir(extensionsDir(), key, "chrome-profile"));
  return listExtensions();
}

/** Chrome のプロフィールにインストール済みの拡張機能を探して、コピーしてから読み込む */
async function importFromChrome(key: KnownExtensionKey): Promise<BrowserExtensionInfo[]> {
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
    const target = knownExtensionDir(extensionsDir(), key, "chrome-profile");
    await fs.rm(target, { recursive: true, force: true });
    // Chrome 専用のメタデータ（_metadata）は Electron が読み込みを拒否するので除く
    await fs.cp(path.join(base, latest), target, { recursive: true, filter: (src) => path.basename(src) !== "_metadata" });
    await reload(target);
    // ウェブストアから取った同じ拡張機能があれば消す（同じパネルが 2 つ出ないように）
    await deleteManaged(knownExtensionDir(extensionsDir(), key, "webstore"));
    return listExtensions();
  }
  throw new Error("Chrome にこの拡張機能が見つかりませんでした");
}

/** 展開済みの拡張機能のフォルダを指定して読み込む */
async function addExtensionFolder(dir: string): Promise<BrowserExtensionInfo[]> {
  await fs.access(path.join(dir, "manifest.json")).catch(() => {
    throw new Error("manifest.json があるフォルダ（展開済みの拡張機能）を選んでください");
  });
  await reload(dir);
  const manual = await readManualList();
  if (!manual.includes(dir)) await fs.writeFile(manualListFile(), JSON.stringify([...manual, dir], null, 2));
  return listExtensions();
}

async function removeExtension(extPath: string): Promise<BrowserExtensionInfo[]> {
  const manual = await readManualList();
  if (manual.includes(extPath)) {
    // 指定したフォルダは利用者のものなので消さず、読み込みをやめて一覧から外すだけ
    unload(extPath);
    loadErrors.delete(extPath);
    await fs.writeFile(manualListFile(), JSON.stringify(manual.filter((p) => p !== extPath), null, 2));
  } else if (isManagedExtensionDir(extensionsDir(), extPath)) {
    // 画面から届いたパスは、保存先のすぐ下のフォルダのときだけ消す（".." を含むパスで保存先の外を消さない）
    await deleteManaged(extPath);
  } else {
    throw new Error("この拡張機能は Kickoff の一覧にありません");
  }
  return listExtensions();
}

/** Kickoff が取得・写した拡張機能を、読み込みをやめてフォルダごと消す（保存先のすぐ下のフォルダだけ） */
async function deleteManaged(dir: string) {
  if (!isManagedExtensionDir(extensionsDir(), dir)) return;
  const resolved = path.resolve(dir);
  unload(resolved);
  loadErrors.delete(resolved);
  await fs.rm(resolved, { recursive: true, force: true });
}

/** 読み込んでいれば、埋め込みブラウザのセッションから外す */
function unload(dir: string) {
  const s = browserSession();
  const ext = s.extensions.getAllExtensions().find((e) => path.resolve(e.path) === path.resolve(dir));
  if (ext) s.extensions.removeExtension(ext.id);
}

async function reload(dir: string) {
  unload(dir);
  try {
    await browserSession().extensions.loadExtension(dir, { allowFileAccess: true });
    loadErrors.delete(dir);
  } catch (e) {
    loadErrors.set(dir, errorMessage(e));
    throw e;
  }
}

async function listExtensionDirs(): Promise<string[]> {
  const entries = await fs.readdir(extensionsDir(), { withFileTypes: true }).catch(() => []);
  const managed = entries.filter((d) => d.isDirectory()).map((d) => path.join(extensionsDir(), d.name));
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

/** 埋め込みブラウザの拡張機能（IPC の browserExtensions）。どれも、そのあとの一覧を返す */
export const browserExtensionHandlers: IpcHandlers["browserExtensions"] = {
  list: () => listExtensions(),
  install: (_e, key) => installFromWebStore(key),
  importFromChrome: (_e, key) => importFromChrome(key),
  addFolder: async () => {
    const [dir] = await pickPaths({ properties: ["openDirectory"], title: "展開済みの拡張機能のフォルダを選択" });
    return dir ? addExtensionFolder(dir) : listExtensions();
  },
  remove: (_e, extPath) => removeExtension(extPath),
};

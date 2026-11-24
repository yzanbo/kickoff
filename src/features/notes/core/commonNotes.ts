// 共通のノート（どのプロジェクトにも属さないノート）の置き場 = Kickoff が用意する見えないプロジェクト（kind "common"）。
// 本体（repo_path）とノートのフォルダ（note_dir）をいつも同じフォルダ（設定の common_notes_dir、なければノートの親フォルダの下の _common）にして、
// ノートの仕組み（NoteDirs・ノートのチャットの作業場所）をそのまま使う。起動したときと、利用者がフォルダの設定を変えたときに合わせる（sync）
import { mkdirSync } from "node:fs";
import path from "node:path";
import { COMMON_NOTES_FOLDER } from "@shared/notes/names";
import type { CommonNotesUnavailable } from "@shared/notes/types";
import type { AppSettings, SettingsPatch } from "@shared/foundation/contract/settings";
import type { Project } from "@shared/projects/types";
import type { ProjectsApi } from "@/features/projects/core/index";
import type { SettingsUpdateHook } from "@/features/settings/core/index";
import { Conflict } from "@/foundation/core/errors";
import { expandHome, realPathLoose, realPathOrSelf } from "@/foundation/core/system/paths";

/** 見えないプロジェクトの名前（画面には出さないが、チャットの画面などがプロジェクト名で引くので、画面の言葉と同じにしておく） */
const COMMON_NOTES_NAME = "共通のノート";

/** フォルダを決める設定の値 */
type FolderSettings = Pick<AppSettings, "notes_dir" | "common_notes_dir">;

export interface CommonNotes {
  /** 設定の common_notes_dir が null のときのフォルダ（いまの親フォルダの下の _common） */
  defaultDir(): string;
  /** 使える共通のノートのプロジェクト（使えない・まだ用意していなければ null） */
  project(): Project | null;
  /** 使えない理由（使えるなら null） */
  unavailable(): CommonNotesUnavailable | null;
  /** 設定に合わせる: なければ作る・フォルダを作る・場所が変わっていれば付け替える（重なり・失敗は使えない状態にし、投げない） */
  sync(): Promise<void>;
  /** 設定の変更に挟む（場所が変わるなら、作業中のチャットがあれば断り、保存したあと付け替える） */
  settingsHook: SettingsUpdateHook;
}

export function createCommonNotes(d: {
  projects: Pick<ProjectsApi, "store" | "isBusy" | "changeOwnedFolder">;
  settings(): AppSettings;
  /** ノートの親フォルダの既定（設定の notes_dir が null のとき） */
  defaultRoot: string;
}): CommonNotes {
  const store = d.projects.store;
  const rootOf = (s: FolderSettings) => expandHome(s.notes_dir ?? d.defaultRoot);
  const folderOf = (s: FolderSettings) => (s.common_notes_dir ? path.resolve(expandHome(s.common_notes_dir)) : path.join(rootOf(s), COMMON_NOTES_FOLDER));
  // 見えないプロジェクトはゴミ箱に入れさせないので、ゴミ箱は探さない
  const owned = () => store.list().find((p) => p.kind === "common");
  /** そのフォルダ（実体）を本体にしている、共通のノートでないプロジェクト（ゴミ箱のものも。repo_path は 1 つのプロジェクトにだけ登録できる） */
  const clashAt = (real: string, except: number | undefined) =>
    [...store.list(), ...store.trashed()].find((p) => p.id !== except && (p.repo_path === real || realPathOrSelf(p.repo_path) === real));
  const clashMessage = (p: Project, real: string) =>
    `共通のノートのフォルダ（${real}）は、プロジェクト「${p.name}」${store.get(p.id) ? "" : "（Kickoff のゴミ箱にあります）"}のフォルダと同じなので、共通のノートを使えません。設定の「共通のノートのフォルダ」で別のフォルダを選んでください`;
  let unavailable: CommonNotesUnavailable | null = null;

  const syncNow = async () => {
    const target = folderOf(d.settings());
    let real: string;
    try {
      // コアが動いている間はフォルダがいつもあるようにする（共通のノートのチャットの作業場所なので、ないと AI を起動できない）
      mkdirSync(target, { recursive: true });
      real = realPathOrSelf(target);
    } catch (e) {
      unavailable = { message: `共通のノートのフォルダ（${target}）を作れません（${(e as Error).message}）`, project_id: null };
      return;
    }
    const current = owned();
    const clash = clashAt(real, current?.id);
    if (clash) {
      // 作らない・付け替えない（利用者のプロジェクトを優先し、起動は止めない）
      unavailable = { message: clashMessage(clash, real), project_id: clash.id };
      return;
    }
    if (!current) {
      const created = store.create({ name: COMMON_NOTES_NAME, repo_path: real, provider: d.settings().default_provider, kind: "common" });
      store.update(created.id, { note_dir: real });
    } else if (current.repo_path !== real || current.note_dir !== real) {
      try {
        await d.projects.changeOwnedFolder(current, { repo_path: real, note_dir: real });
      } catch (e) {
        unavailable = { message: `共通のノートのフォルダを ${real} に移せません（${(e as Error).message}）`, project_id: null };
        return;
      }
    }
    unavailable = null;
  };
  // 起動したときと設定を変えたときが重なっても、付け替えを 1 つずつ流す
  let queue: Promise<void> = Promise.resolve();
  const sync = () => (queue = queue.then(syncNow));

  /** 場所が変わる変更か（変わるなら、新しい場所） */
  const nextFolder = (patch: SettingsPatch, current: AppSettings): string | null => {
    if (patch.notes_dir === undefined && patch.common_notes_dir === undefined) return null;
    const next = folderOf({ notes_dir: patch.notes_dir === undefined ? current.notes_dir : patch.notes_dir, common_notes_dir: patch.common_notes_dir === undefined ? current.common_notes_dir : patch.common_notes_dir });
    return next === folderOf(current) ? null : next;
  };

  return {
    defaultDir: () => path.join(rootOf(d.settings()), COMMON_NOTES_FOLDER),
    project: () => (unavailable ? null : (owned() ?? null)),
    unavailable: () => unavailable,
    sync,
    settingsHook: {
      before(patch, current) {
        const next = nextFolder(patch, current);
        if (!next) return;
        const project = owned();
        // 利用者が選んだフォルダが自分のプロジェクトなら、保存する前に断る（親フォルダを変えて _common が重なったときは、使えない状態で知らせる）
        const clash = patch.common_notes_dir ? clashAt(realPathLoose(next), project?.id) : undefined;
        if (clash) throw new Conflict(`このフォルダは「${clash.name}」として登録済みなので、共通のノートのフォルダにできません`);
        if (project && d.projects.isBusy(project.id)) throw new Conflict("作業中の共通のノートのチャットがあるので、共通のノートのフォルダを変えられません。終わってから（または中断してから）変えてください");
      },
      async after(next, previous) {
        if (folderOf(next) !== folderOf(previous) || unavailable) await sync();
      },
    },
  };
}

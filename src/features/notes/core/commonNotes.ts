// 共通（どのプロジェクトにも属さない共通のチャットと共通のノートの持ち主）= Kickoff が用意するプロジェクト（kind "common"。1 つだけ）。
// 本体（repo_path）は作業フォルダ（ノートの親フォルダの下の .common-work。設定では変えない）、ノートのフォルダ（note_dir）は設定の common_notes_dir
// （なければノートの親フォルダの下の _common）。プロジェクトと同じ「作業場所 ＋ ノートのフォルダ」の形にして、ノートの仕組み（NoteDirs・書ける場所）を
// そのまま使う。起動したときと、利用者がフォルダの設定を変えたときに合わせる（sync）
import { mkdirSync } from "node:fs";
import path from "node:path";
import { COMMON_NOTES_FOLDER, COMMON_WORK_FOLDER } from "@shared/notes/names";
import type { CommonNotesUnavailable } from "@shared/notes/types";
import type { AppSettings, SettingsPatch } from "@shared/foundation/contract/settings";
import { COMMON_PROJECT_LABEL, isCommonProject, isUserProject } from "@shared/projects/kinds";
import type { Project } from "@shared/projects/types";
import type { ProjectsApi } from "@/features/projects/core/index";
import type { SettingsUpdateHook } from "@/features/settings/core/index";
import { Conflict } from "@/foundation/core/errors";
import { expandHome, isInside, realPathLoose, realPathOrSelf } from "@/foundation/core/system/paths";
import type { NoteDirs } from "./noteDir";

/** フォルダを決める設定の値 */
type FolderSettings = Pick<AppSettings, "notes_dir" | "common_notes_dir">;

/** 共通の 2 つのフォルダ（work = 本体 = 共通のチャットの作業フォルダ、notes = 共通のノートのフォルダ） */
interface CommonPlace {
  work: string;
  notes: string;
}

export interface CommonNotes {
  /** 設定の common_notes_dir が null のときのノートのフォルダ（いまの親フォルダの下の _common） */
  defaultDir(): string;
  /** 使える共通のプロジェクト（使えない・まだ用意していなければ null） */
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
  /** そのフォルダをノートのフォルダにしているプロジェクト（_common を予約する前に note_folder が _common になったもの・note_dir で選んだもの） */
  noteDirUsers: NoteDirs["usersOf"];
}): CommonNotes {
  const store = d.projects.store;
  const rootOf = (s: FolderSettings) => expandHome(s.notes_dir ?? d.defaultRoot);
  const placeOf = (s: FolderSettings): CommonPlace => ({
    // 作業フォルダはノートの親フォルダに付いていく（common_notes_dir はノートのフォルダだけを決める）
    work: path.join(rootOf(s), COMMON_WORK_FOLDER),
    notes: s.common_notes_dir ? path.resolve(expandHome(s.common_notes_dir)) : path.join(rootOf(s), COMMON_NOTES_FOLDER),
  });
  const samePlace = (a: CommonPlace, b: CommonPlace) => a.work === b.work && a.notes === b.notes;
  // 共通はゴミ箱に入れさせないので、ゴミ箱は探さない
  const owned = () => store.list().find(isCommonProject);
  /** そのフォルダ（実体）を本体にしている、共通でないプロジェクト（ゴミ箱のものも。repo_path は 1 つのプロジェクトにだけ登録できる） */
  const clashAt = (real: string, except: number | undefined) =>
    [...store.list(), ...store.trashed()].find((p) => p.id !== except && (p.repo_path === real || realPathOrSelf(p.repo_path) === real));
  /** そのフォルダ（実体）をノートのフォルダにしている、利用者のプロジェクト（重なると同じファイルが 2 つの欄に出て、ノートのチャットがどちらのものか分からなくなる） */
  const noteUserAt = (real: string, except: number | undefined) => d.noteDirUsers(real, except).find(isUserProject);
  const clashMessage = (p: Project, real: string, folder: string, what: string, fix: string) =>
    `${folder}（${real}）は、プロジェクト「${p.name}」${store.get(p.id) ? "" : "（Kickoff のゴミ箱にあります）"}の${what}と同じなので、共通のチャットと共通のノートを使えません。${fix}`;
  /** 2 つのフォルダが利用者のプロジェクトと重なれば、その理由（重ならなければ null） */
  const clashOf = (place: CommonPlace, except: number | undefined): CommonNotesUnavailable | null => {
    const checks = [
      { real: place.work, folder: "共通のチャットの作業フォルダ", fix: "設定の「ノートの保存先」で別のフォルダを選んでください" },
      { real: place.notes, folder: "共通のノートのフォルダ", fix: "設定の「共通のノートのフォルダ」で別のフォルダを選んでください" },
    ];
    for (const { real, folder, fix } of checks) {
      const clash = clashAt(real, except);
      if (clash) return { message: clashMessage(clash, real, folder, "フォルダ", fix), project_id: clash.id };
      const noteUser = noteUserAt(real, except);
      if (noteUser) return { message: clashMessage(noteUser, real, folder, "ノートのフォルダ", fix), project_id: noteUser.id };
    }
    return null;
  };
  let unavailable: CommonNotesUnavailable | null = null;

  /** フォルダを作って実体のパスを返す（作れなければ使えない理由を unavailable に置いて null） */
  const ensure = (dir: string, folder: string): string | null => {
    try {
      // コアが動いている間はフォルダがいつもあるようにする（作業フォルダは共通のチャットの作業場所なので、ないと AI を起動できない）
      mkdirSync(dir, { recursive: true });
      return realPathOrSelf(dir);
    } catch (e) {
      unavailable = { message: `${folder}（${dir}）を作れません（${(e as Error).message}）`, project_id: null };
      return null;
    }
  };

  const syncNow = async () => {
    const want = placeOf(d.settings());
    const work = ensure(want.work, "共通のチャットの作業フォルダ");
    const notes = work === null ? null : ensure(want.notes, "共通のノートのフォルダ");
    if (work === null || notes === null) return;
    const current = owned();
    // 前の版の名前（共通のノート）から付け替える（チャットの画面などがプロジェクト名で引くので、画面の見出しと同じにしておく）。名前は画面に出さないので、場所が使えなくても直してよい
    if (current && current.name !== COMMON_PROJECT_LABEL) store.update(current.id, { name: COMMON_PROJECT_LABEL });
    // 作らない・付け替えない（利用者のプロジェクトを優先し、起動は止めない）。ノートのフォルダを作業フォルダの中にはしない（設定の before と同じ理由）
    const inWork = isInside(work, notes) ? { message: `共通のノートのフォルダ（${notes}）が共通のチャットの作業フォルダの中なので、共通のチャットと共通のノートを使えません。設定の「共通のノートのフォルダ」で別のフォルダを選んでください`, project_id: null } : null;
    const clash = inWork ?? clashOf({ work, notes }, current?.id);
    if (clash) {
      unavailable = clash;
      return;
    }
    if (!current) {
      const created = store.create({ name: COMMON_PROJECT_LABEL, repo_path: work, provider: d.settings().default_provider, kind: "common" });
      store.update(created.id, { note_dir: notes });
    } else if (current.repo_path !== work || current.note_dir !== notes) {
      try {
        // 前の版のデータ（本体とノートのフォルダが同じ _common）も、ここで作業フォルダに付け替わる（チャットは区切りを置いて新しいセッションへ）
        await d.projects.changeOwnedFolder(current, { repo_path: work, note_dir: notes });
      } catch (e) {
        unavailable = { message: `共通のフォルダを ${work}（作業フォルダ）と ${notes}（ノートのフォルダ）に移せません（${(e as Error).message}）`, project_id: null };
        return;
      }
    }
    unavailable = null;
  };
  // 起動したときと設定を変えたときが重なっても、付け替えを 1 つずつ流す
  let queue: Promise<void> = Promise.resolve();
  const sync = () => (queue = queue.then(syncNow));

  /** 場所が変わる変更か（変わるなら、新しい場所） */
  const nextPlace = (patch: SettingsPatch, current: AppSettings): CommonPlace | null => {
    if (patch.notes_dir === undefined && patch.common_notes_dir === undefined) return null;
    const next = placeOf({ notes_dir: patch.notes_dir === undefined ? current.notes_dir : patch.notes_dir, common_notes_dir: patch.common_notes_dir === undefined ? current.common_notes_dir : patch.common_notes_dir });
    return samePlace(next, placeOf(current)) ? null : next;
  };

  return {
    defaultDir: () => path.join(rootOf(d.settings()), COMMON_NOTES_FOLDER),
    project: () => (unavailable ? null : (owned() ?? null)),
    unavailable: () => unavailable,
    sync,
    settingsHook: {
      before(patch, current) {
        const next = nextPlace(patch, current);
        if (!next) return;
        const project = owned();
        // 利用者が選んだノートのフォルダが自分のプロジェクト・作業フォルダなら、保存する前に断る（親フォルダを変えて重なったときは、使えない状態で知らせる）
        if (patch.common_notes_dir) {
          const notes = realPathLoose(next.notes);
          const clash = clashAt(notes, project?.id);
          if (clash) throw new Conflict(`このフォルダは「${clash.name}」として登録済みなので、共通のノートのフォルダにできません`);
          // 作業フォルダの中にノートがあると、共通のチャットの AI が始めにノートを読みにいきやすい（ノートは頼まれたときだけ読む）
          if (isInside(realPathLoose(next.work), notes)) throw new Conflict("このフォルダは共通のチャットの作業フォルダ（の中）なので、共通のノートのフォルダにできません");
        }
        if (project && d.projects.isBusy(project.id)) throw new Conflict("作業中の共通のチャット（共通のノートのチャットも）があるので、共通のフォルダを変えられません。終わってから（または中断してから）変えてください");
      },
      async after(next, previous) {
        if (!samePlace(placeOf(next), placeOf(previous)) || unavailable) await sync();
      },
    },
  };
}

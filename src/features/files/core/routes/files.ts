// 作業場所のファイルの受け口（取り決めは @shared/files/contract.ts。操作するフォルダは取り決めの workdir: true が ?worktree= から解く）
import { z } from "zod";
import { filesContract } from "@shared/files/contract";
import type { Project } from "@shared/projects/types";
import { createProjectFile, listProjectFiles, readProjectAsset, readProjectFile, readProjectImage, renameProjectFile, trashProjectFile, writeProjectFile } from "../files";
import { replaceInProject, searchProject } from "../search";
import type { TrashApi } from "@/features/trash/core/index";
import { implement, type Param } from "@/foundation/core/http/implement";
import { assetResponse, decodeSegments } from "@/foundation/core/http/assets";
import { resolveWorkdir } from "@/foundation/core/workplace/worktrees";
import { Invalid } from "@/foundation/core/errors";
import { flagOn, repoPath, workdirQuery } from "@/foundation/core/http/zodParts";

/** 置換の本文（検索の指定・置換の文・置換する行） */
const replaceBodySchema = z.object({
  query: z.object({
    query: z.string().min(1).max(1000),
    case_sensitive: z.boolean(),
    whole_word: z.boolean(),
    regex: z.boolean(),
    include: z.string().max(2000),
    exclude: z.string().max(2000),
    use_ignore: z.boolean(),
  }),
  replace: z.string().max(10_000),
  preserve_case: z.boolean(),
  files: z.array(z.object({ path: repoPath, lines: z.array(z.object({ line: z.number().int().min(1), text: z.string().max(1000) })).min(1).max(1000) })).min(1).max(5000),
});

/** ファイルを指すクエリ */
const pathQuery = workdirQuery.extend({ path: repoPath });
const globs = z.string().max(2000).default("");
/** 検索のクエリ（ignore=0 なら .gitignore で無視しているものも探す） */
const searchQuery = workdirQuery.extend({ q: z.string().max(1000).default(""), case: flagOn("0"), word: flagOn("0"), regex: flagOn("0"), include: globs, exclude: globs, ignore: flagOn("1") });

/** HTML のファイルのプレビューの口の前置き（1 段目が作業場所、その後ろが作業場所からの相対パス。画面の <base> と同じ形） */
const ASSET_PREFIX = /^\/api\/projects\/[^/]+\/file\/asset\/([^/]+)\/(.+)$/;
/** 作業場所とパスは受け口が URL の生のパスから読む（Hono が解いたあとの形だと %2F を取り違える） */
const rawSegment: Param<string> = { parse: (raw) => raw };

/** 作業場所のファイル（エクスプローラーの一覧・中身・検索・置換・保存・作る・名前の変更・ゴミ箱） */
export function filesRoutes({ projectParam, trashBin }: { projectParam: Param<Project>; trashBin: TrashApi }) {
  return implement(filesContract, {
    context: { projectId: projectParam, place: rawSegment, "*": rawSegment },
    "GET /api/projects/:projectId/files": { query: workdirQuery, run: ({ workdir }) => listProjectFiles(workdir) },
    "GET /api/projects/:projectId/file": { query: pathQuery, run: ({ workdir, query }) => readProjectFile(workdir, query.path) },
    // 画像のファイルの中身（ファイルタブのプレビュー。icns は中の PNG）
    "GET /api/projects/:projectId/file/image": {
      query: pathQuery,
      run: async ({ workdir, query }) => {
        const image = await readProjectImage(workdir, query.path);
        return { bytes: new Uint8Array(image.data), type: image.type };
      },
    },
    "GET /api/projects/:projectId/file/asset/:place/*": {
      run: async ({ projectId: project, raw: c }) => {
        const match = ASSET_PREFIX.exec(new URL(c.req.url).pathname);
        if (!match) throw new Invalid("パスが正しくありません");
        let place: string;
        try {
          place = decodeURIComponent(match[1]);
        } catch {
          throw new Invalid("作業場所の指定が正しくありません");
        }
        const workdir = place === "-" ? project.repo_path : await resolveWorkdir(project.repo_path, place);
        const file = repoPath.parse(decodeSegments(match[2]));
        return assetResponse(c, file, await readProjectAsset(workdir, file));
      },
    },
    "GET /api/projects/:projectId/search": {
      query: searchQuery,
      run: ({ workdir, query: q }) =>
        searchProject(workdir, { query: q.q, case_sensitive: q.case, whole_word: q.word, regex: q.regex, include: q.include, exclude: q.exclude, use_ignore: q.ignore }),
    },
    "POST /api/projects/:projectId/search/replace": { query: workdirQuery, body: replaceBodySchema, run: ({ workdir, body }) => replaceInProject(workdir, body) },
    "PUT /api/projects/:projectId/file": {
      query: workdirQuery,
      body: z.object({ path: repoPath, content: z.string().max(5_000_000), base_hash: z.string().max(100).nullable() }),
      run: ({ workdir, body }) => writeProjectFile(workdir, body.path, body.content, body.base_hash),
    },
    "POST /api/projects/:projectId/file/rename": {
      query: workdirQuery,
      body: z.object({ path: repoPath, name: z.string().min(1).max(255) }),
      run: ({ workdir, body }) => renameProjectFile(workdir, body.path, body.name),
    },
    "POST /api/projects/:projectId/files": {
      query: workdirQuery,
      body: z.object({ path: repoPath, dir: z.boolean().default(false) }),
      run: ({ workdir, body }) => createProjectFile(workdir, body.path, body.dir),
    },
    // 入れたゴミ箱の ID を返す（画面の「元に戻す」）
    "DELETE /api/projects/:projectId/file": {
      query: pathQuery,
      run: async ({ projectId: project, workdir, query }) => {
        const item = await trashProjectFile(workdir, query.path, (target) => trashBin.putPath(target, { projectId: project.id }));
        return { trash_id: item.id };
      },
    },
  });
}

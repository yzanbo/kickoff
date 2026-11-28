// ノートの外の画像の受け口（取り決め @shared/remoteImages/contract.ts の noteImagesContract）
import { z } from "zod";
import type { Project } from "@shared/projects/types";
import { noteImagesContract } from "@shared/remoteImages/contract";
import type { NoteImageService } from "@/features/remoteImages/core/noteImageService";
import { implement, type Param } from "@/foundation/core/http/implement";

const hostSchema = z.string().trim().min(1).max(300);
/** ノートのフォルダからの相対のパス（形は NoteImageService が確かめる） */
const pathSchema = z.string().min(1).max(1024);

/**
 * ノートの外の画像: 表示を許可したホストの一覧・許可・取り消しと、許可したホストの画像（許可はノートごと）。
 * どれも端末には開かない（取り決めに access を書かない）
 */
export function noteImageRoutes({ projectParam, noteImages }: { projectParam: Param<Project>; noteImages: NoteImageService }) {
  return implement(noteImagesContract, {
    context: { projectId: projectParam },
    "GET /api/projects/:projectId/note-image-hosts": {
      query: z.object({ path: pathSchema }),
      run: ({ projectId: project, query }) => ({ hosts: noteImages.hosts(project.id, query.path) }),
    },
    "PUT /api/projects/:projectId/note-image-hosts": {
      body: z.object({ path: pathSchema, host: hostSchema }),
      run: ({ projectId: project, body }) => ({ hosts: noteImages.allow(project.id, body.path, body.host) }),
    },
    "DELETE /api/projects/:projectId/note-image-hosts": {
      query: z.object({ path: pathSchema, host: hostSchema }),
      run: async ({ projectId: project, query }) => ({ hosts: await noteImages.revoke(project.id, query.path, query.host) }),
    },
    // ページとして開かれても何も動かないよう sandbox の CSP を付ける（fileResponse）
    "GET /api/projects/:projectId/note-remote-image": {
      query: z.object({ path: pathSchema, url: z.string().min(1).max(8192) }),
      run: async ({ projectId: project, query }) => {
        const image = await noteImages.image(project.id, query.path, query.url);
        return { bytes: new Uint8Array(image.body), type: image.contentType, cache: "private, max-age=3600" };
      },
    },
  });
}

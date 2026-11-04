import assert from "node:assert/strict";
import { test } from "node:test";
import type { VoiceModelInfo, VoiceStatus } from "@shared/types";
import { reduceVoiceStatus } from "./voice";

const model = (id: string) => ({ id, download: null, downloaded: false }) as unknown as VoiceModelInfo;
const status = { ready: false, local: { whisper: null, ffmpeg: null, models: [model("base"), model("small")] } } as unknown as VoiceStatus;

test("reduceVoiceStatus: ダウンロードの進み具合は、そのモデルにだけ当てる。ほかの知らせでは同じもののまま", () => {
  const download = { received: 5, total: 10 };
  const next = reduceVoiceStatus(status, { type: "voice_model", id: "small", download, downloaded: false });
  assert.deepEqual(next.local.models[1].download, download);
  assert.equal(next.local.models[0], status.local.models[0]);
  assert.equal(reduceVoiceStatus(status, { type: "project_deleted", id: 1 }), status);
});

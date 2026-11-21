// チャットの実行の振る舞いの表（筋書き）のすべて。01 の 8 章の 1〜33 のうち状態の移り変わりに関わるものを 1 行ずつ（34〜38 はいまのテストを網にする）
import { COMPACT_SCENARIOS } from "./scenariosCompact";
import { QUEUE_SCENARIOS } from "./scenariosQueue";
import { RECOVERY_SCENARIOS } from "./scenariosRecovery";
import { RESTART_SCENARIOS } from "./scenariosRestart";
import { SEND_SCENARIOS } from "./scenariosSend";
import type { Scenario } from "./types";

export const SCENARIOS: Scenario[] = [...SEND_SCENARIOS, ...COMPACT_SCENARIOS, ...QUEUE_SCENARIOS, ...RECOVERY_SCENARIOS, ...RESTART_SCENARIOS].sort((a, b) => a.id.localeCompare(b.id));

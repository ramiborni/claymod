import type { AgentId } from "@claymod/core/bridge-protocol";
import { antigravity } from "./antigravity";
import { claudeCode } from "./claude-code";
import { codex } from "./codex";
import { gemini } from "./gemini";
import type { AgentRunner } from "./types";

/** The one place runners are registered. Add a new agent here and in AGENT_IDS (core). */
export const RUNNERS: Record<AgentId, AgentRunner> = {
  "claude-code": claudeCode,
  codex,
  gemini,
  antigravity,
};

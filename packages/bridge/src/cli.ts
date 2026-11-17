#!/usr/bin/env bun
import { run } from "./run";
import { systemContext } from "./system-context";

// systemContext() clears LANGSMITH_* / LANGCHAIN_* before anything else runs.
const context = systemContext();
const exitCode = await run(Bun.argv.slice(2), context);
process.exit(exitCode);

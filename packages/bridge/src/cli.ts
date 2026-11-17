#!/usr/bin/env bun
import { run } from "./run";

const output = run(Bun.argv.slice(2));
if (output.stdout) process.stdout.write(`${output.stdout}\n`);
if (output.stderr) process.stderr.write(`${output.stderr}\n`);
process.exit(output.exitCode);

#!/usr/bin/env node
import { runCli } from './cli.mjs';

const { exitCode, output } = await runCli(process.argv.slice(2));
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = exitCode;


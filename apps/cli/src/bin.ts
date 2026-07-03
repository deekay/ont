#!/usr/bin/env node
import { runOntCli } from "./live-verify.js";

process.exitCode = await runOntCli(process.argv.slice(2));

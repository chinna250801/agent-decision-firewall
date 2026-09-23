#!/usr/bin/env node
// Plain-JS launcher so `firewall` works from npm link / global install:
// registers tsx's ESM loader, then imports the TypeScript CLI.
import { register } from "tsx/esm/api";
register();
await import("../src/cli/index.ts");

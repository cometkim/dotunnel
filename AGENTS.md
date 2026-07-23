# AGENTS.md - DOtunnel Codebase Guide

This document provides guidelines for AI coding agents working in the DOtunnel repository.

## Project Overview

DOtunnel is a tunnel service with:
- **dotunnel-cloudflare**: Cloudflare Workers app with React dashboard (TypeScript)
- **dotunnel-cli**: CLI client (Rust)
- **dotunnel**: Core library (Rust)

## Build/Lint/Test Commands

### Node.js (Cloudflare Workers)

Use Yarn (Berry) as package manager

```sh
yarn workspace dotunnel-cloudflare dev       # Start Vite dev server
yarn workspace dotunnel-cloudflare generate  # Generate Wrangler types
# No need to build manually - Wrangler handles it

# Linting & Formatting (Biome)
yarn workspace dotunnel-cloudflare check:types  # TypeScript check
yarn workspace dotunnel-cloudflare check:format # Check formatting
yarn workspace dotunnel-cloudflare check:lint   # Check linting

# Fix formatting/linting issues
yarn workspace dotunnel-cloudflare biome check --write
yarn workspace dotunnel-cloudflare biome format --write
yarn workspace dotunnel-cloudflare biome lint --write

# Wrangler commands
yarn workspace dotunnel-cloudflare wrangler dev                             # Local Workers development
yarn workspace dotunnel-cloudflare wrangler d1 migrations apply DB --local  # Apply D1 migrations locally
```

### Rust (CLI)

```sh
# Build
cargo build -p dotunnel-cli
cargo build -p dotunnel-cli --release

# Run
cargo run -p dotunnel-cli -- --help
cargo run -p dotunnel-cli -- [subcommand]

# Check/Lint
cargo clippy

# Test (when tests exist)
cargo nextest
cargo nextest -p dotunnel-cli
cargo nextest <test_name>                 # Run single test by name
cargo nextest <test_name> -- --nocapture  # With stdout output
```

## Code Style Guidelines

### TypeScript/JavaScript

**Formatting (enforced by Biome):**
- Use double quotes for strings
- Use 2-space indentation
- Use semicolons
- Organize imports automatically

**Imports:**
```typescript
// Use path alias for internal imports
import { Config } from "#app/models/config.ts";
import { validateSession } from "#app/auth/session.ts";

// Always include .ts/.tsx extensions
import { someUtil } from "#app/lib/utils.ts";

// Use type-only imports when appropriate
import type { Session } from "#app/auth/session.ts";

// External imports first, then internal
import { env } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import * as v from "valibot";

import { Config } from "#app/models/config.ts";
```

**Type Definitions:**
```typescript
// Prefer `type` over `interface`
export type Session = {
  publicId: string;
  userId: number;
  expiresAt: Date;
};

// Use Valibot for runtime validation with inferred types
export const ConfigSchema = v.object({
  _v: v.literal(1),
  bootstrapped: v.boolean(),
});
export type Config = v.InferOutput<typeof ConfigSchema>;
```

**Naming Conventions:**
- Files: kebab-case for directories, PascalCase for React components
- Variables/functions: camelCase
- Types/interfaces: PascalCase
- Constants: SCREAMING_SNAKE_CASE
- React components: PascalCase function names

**Error Handling:**

```typescript
// Use flight-result (workspace package: ./packages/flight-result) for Result types.
// Results are plain discriminated objects - they cross RSC/JSON boundaries
// as-is with no (de)serialization, and narrow natively on `.status`.
import { Result } from "flight-result";

const result = await createThing(input);
if (result.status === "error") return result;
result.value; // narrowed

// Railway composition: Result.gen passes the yieldable adapter to the body
Result.gen(async function* ($) {
  const value = yield* $(await fetchThing(id));
  return Result.ok(value);
});

// Domain errors are plain tagged objects (src/app/lib/errors.ts); attach
// diagnostic causes non-enumerably via withCause so they never serialize.
```

### Rust

**Standard Rust conventions:**
- snake_case for functions, variables, modules
- PascalCase for types, traits, enums
- SCREAMING_SNAKE_CASE for constants

**Error Handling:**
```rust
// Use anyhow for application errors with context
use anyhow::{Context, Result};

fn load_config() -> Result<Config> {
    let content = fs::read_to_string(&path)
        .context("Failed to read config file")?;
    Ok(config)
}

// Use thiserror for library errors
use thiserror::Error;

#[derive(Error, Debug)]
pub enum TunnelError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
}
```

**CLI with Clap:**
```rust
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "dotunnel")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}
```

## Important Patterns

1. **Path Aliases**: Use `#*` for imports from `src/` in dotunnel-cloudflare
2. **Valibot Schemas**: Define runtime schemas and infer TypeScript types
5. **Explicit Extensions**: Always include `.ts`/`.tsx` in import paths

## Source Code Reference

Use [Zread MCP server](https://docs.z.ai/devpack/mcp/zread-mcp-server)

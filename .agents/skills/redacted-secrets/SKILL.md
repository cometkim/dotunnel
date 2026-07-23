---
name: redacted-secrets
description: Handle secret values (client secrets, API keys, tokens, credentials) in dotunnel-cloudflare. Use whenever adding or touching a secret-bearing field, writing a "use server" function that returns config/provider data, passing config to components, or persisting/serializing config. Also use when a "Redacted" serialization error appears.
---

# Redacted secrets

Every secret value in `dotunnel-cloudflare` must be wrapped in `Redacted<T>` (`src/app/lib/redacted.ts`) from the moment it enters the system.
The wrapper stores the value in a module-private WeakMap, so no spread, enumeration, `JSON.stringify`, or RSC serialization can reach it.

The ONLY way to read it is `Redacted.value()`, which makes every exposure greppable.

## Core rules

1. **Annotate at the parse boundary.** Secret fields in valibot schemas use
   `redactedString` (`src/app/models/config.ts`), which accepts a plain string
   OR an existing `Redacted<string>` and always outputs `Redacted<string>`.
   For ad-hoc values use `Redacted.make(value)` immediately on receipt.

2. **Reveal only at sanctioned boundaries**, each with a comment explaining
   why the reveal is legitimate. Current sanctioned boundaries:
   - `serializeConfig()` in `models/config.ts` — persistence to D1 and the
     base64 `CONFIG` export the admin pastes into `wrangler secret put`.
   - OAuth token exchange in `auth/oauth.ts` — the secret's actual consumer.

   Adding a new `Redacted.value()` call site is a security-review event, not
   a routine edit. Audit all reveals with: `rg -n 'Redacted\.value'`

3. **Never let server types cross the RSC boundary.** Client component props
   and `"use server"` return values are serialized into the flight payload
   (including props of server components in dev). Use the public views:
   - `PublicConfig` / `PublicAuthProvider` (via `toPublicConfig()` /
     `toPublicProvider()`) for anything sent toward the browser.
   - `AuthProviderInput` (plain-string secret) for client→server wire input;
     parse it with the `AuthProvider` schema server-side before storing.

4. **Loud failures are the design, not a bug to suppress:**
   - `JSON.stringify` on anything containing a `Redacted` **throws**. Fix by
     using `serializeConfig()` (or stripping the secret), never by unwrapping
     inline to "make the error go away".
   - Passing a `Redacted` across RSC throws (class instances aren't
     serializable). Fix by converting to the public view.

5. **Intentional client-side reveals** (currently only `configBase64` for
   static deployment) must be computed server-side at an explicit request
   and documented as intentional at the definition site.

## Adding a new secret field — checklist

- [ ] Schema field uses `redactedString` (or a new `redacted*` schema).
- [ ] `serializeConfig()` (or the relevant persister) reveals it explicitly.
- [ ] The consumer unwraps with `Redacted.value()` + a justification comment.
- [ ] Public view types (`Public*`) omit the field; `toPublic*()` strips it.
- [ ] Wire input type carries a plain string and is parsed server-side.
- [ ] No `"use server"` function returns the annotated (non-public) type.

## Known pitfalls in this codebase

- **Results and domain errors are plain structural objects**
  (`flight-result` workspace package) and cross RSC boundaries as-is -
  no (de)serialization anywhere. The related secret rule: attach diagnostic
  `cause` values to errors via `withCause` (non-enumerable), never as a
  plain field, so raw driver exceptions and other server internals cannot
  leak into the flight payload.
- The admin config page edits providers as a **patch** (`ConfigPatch`:
  hosts + `addProviders` + `removeProviderIds`) because the client never
  holds stored secrets and therefore cannot round-trip the full config.
- Session tokens, device codes, and OAuth access tokens are handled as raw
  strings in server-only code paths today; if any of them ever approach an
  RSC boundary or a log line, wrap them in `Redacted` first.

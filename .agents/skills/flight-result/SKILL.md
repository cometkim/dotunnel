---
name: flight-result
description: Typed error handling with flight-result, the in-repo structural Result library (packages/flight-result). Use when writing or refactoring fallible functions, defining domain errors, returning Results from RSC server functions or passing them through component props, composing railway-style flows, or converting try/catch code to Results.
---

# flight-result

`flight-result` (workspace package: `./packages/flight-result`) is a Result
type that is **plain data**:

```ts
type Result<T, E> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "error"; readonly error: E };
```

No classes, no methods, no `Symbol.iterator`. That single design decision is
the whole point: a Result crosses React Flight (server-function returns,
component props), `JSON.stringify`, and `structuredClone` **as-is**. There is
no serialize/deserialize step anywhere, nothing to remember at boundaries,
and TypeScript narrows it natively.

```ts
import { Result } from "flight-result";
```

## Reading a Result

Prefer structural narrowing - it needs no imports and works in any file,
including client components:

```ts
const result = await createTunnel(input);
if (result.status === "error") {
  setError(result.error.message);
  return;
}
result.value; // narrowed to T
```

Guards and escape hatches when a callback needs them:

```ts
Result.isOk(result);          // result is Ok<T>
Result.isErr(result);         // result is Err<E>
Result.unwrapOr(result, 0);   // value or fallback
Result.unwrap(result);        // value or throws Panic - only when Err is a bug
Result.is(value);             // guard for untrusted input (parsed JSON etc.)
```

## Creating and transforming

```ts
Result.ok(value);
Result.ok(); // Ok<void>
Result.err(error);

Result.map(result, (v) => v.id);          // Result<U, E>
Result.mapError(result, (e) => wrap(e));  // Result<T, F>
Result.andThen(result, (v) => next(v));   // Result<U, E | F> - flat-maps
```

All transforms are data-first functions; there is no method chaining.
For anything longer than one step, use `Result.gen` or plain early returns.

## Exception boundaries

Wrap throwing code exactly at I/O points, mapping the cause to a domain error.

The `cause` goes into the error via `withCause` (see below), never as a plain field:

```ts
const row = await Result.tryPromise({
  try: () => env.DB.prepare(sql).bind(id).first(),
  catch: (e) => DatabaseError({ operation: "get tunnel", cause: e }),
});
// Result.try({...}) is the sync equivalent
```

A throw that is a bug (not an expected failure) should stay a throw.
Inside flight-result machinery it escalates to `Panic` - never catch a Panic, fix the bug.

## Railway composition: Result.gen

`Result.gen` runs an async generator body and passes it the yieldable adapter `$`.

`yield* $(result)` unwraps an Ok or short-circuits the whole gen with the first Err. The returned error type is the union of everything yielded or returned:

```ts
export async function createTunnel(
  input: unknown,
): Promise<Result<TunnelDisplay, TunnelError>> {
  return Result.gen(async function* ($) {
    const userId = yield* $(requireUserId());
    const tunnel = yield* $(await createTunnelForUser(userId, input));
    return Result.ok(tunnel);
  });
}
```

Notes:

- `$` comes from the callback parameter - never import an adapter.
- Await promises inline: `yield* $(await somePromise)`.
- Early `return Result.err(...)` from the body is fine and adds to the error union.
- The adapter is the only iterable in the system, and it is consumed synchronously inside the body - it must never escape or cross a boundary.
- For simple flows, plain early returns (`if (r.status === "error") return r;`) are just as idiomatic; gen earns its keep when several fallible steps chain.

## Domain errors

Domain errors are plain tagged objects created by callable factories - same name as value and type, `.is` guards, **no `new`**:

```ts
import { type Tagged, isTagged, withCause } from "flight-result";

export type DatabaseError = Tagged<"DatabaseError"> & {
  readonly operation: string;
  readonly message: string;
};

export const DatabaseError = Object.assign(
  (args: { operation: string; cause: unknown }): DatabaseError => {
    const error: DatabaseError = {
      _tag: "DatabaseError",
      operation: args.operation,
      message: `Database ${args.operation} failed`,
    };
    return withCause(error, args.cause);
  },
  {
    is: (value: unknown): value is DatabaseError =>
      isTagged(value, "DatabaseError"),
  },
);
```

Rules:

- Every enumerable field must be boundary-safe plain data.
   It WILL be serialized to the client whenever the error crosses.
- Diagnostic context (raw driver exceptions, upstream errors, anything sensitive or unserializable) attaches via `withCause`.
   The property is non-enumerable, so it is readable in server code and logs but invisible to spread, JSON, and Flight.
- Build human messages in the factory so call sites stay one-liners.
- Match on `_tag` with a `switch` or `if` - discriminated unions narrow natively. 
   Use `.is` for `unknown` values (e.g. caught exceptions).
- Group related errors into union aliases (`TunnelError`, `AdminError`).

## Pitfalls

- **Methods don't exist**: `result.map(fn)` / `result.isOk()` are not a thing - use `Result.map(result, fn)` or narrow on `.status`.
- **`new SomeError(...)`** - error factories are plain calls.
- **`cause` as an enumerable field** - it would serialize to the browser; always `withCause`.
- **Catching Panic** - a Panic is a bug report, not a control-flow value.
- **Letting `$` escape the gen body** (storing it, passing it to callbacks that outlive the gen) - it is only valid synchronously inside the body.

## Testing

The library's own suite pins the serialization guarantees:

```sh
node --test packages/flight-result/result.test.ts
```

/**
 * flight-result - a Result type that is plain data.
 *
 * Ok and Err are frozen-shape plain objects (`Object.prototype`, no methods, no `Symbol.iterator`).
 *
 * So a Result crosses ANY structured boundary as-is:
 * - React Flight (server action returns, component props), 
 * - JSON.stringify
 * - structuredClone
 * - postMessage
 *
 * There is no serialize/deserialize step and nothing to forget at boundaries, 
 * the wire form IS the in-memory form.
 *
 * TypeScript narrows structurally, no guards required:
 *
 * ```ts
 * const result = await createThing(input);
 * if (result.status === "error") return result;
 * result.value; // narrowed
 * ```
 *
 * Railway-style composition uses `Result.gen`, which passes a yieldable adapter
 * to the generator body (the adapter is transient and never crosses a boundary):
 *
 * ```ts
 * Result.gen(async function* ($) {
 *   const user = yield* $(await findUser(id));
 *   const posts = yield* $(await loadPosts(user));
 *   return Result.ok(posts);
 * });
 * ```
 */

// =============================================================================
// Core Types
// =============================================================================

export type Ok<T> = {
  readonly status: "ok";
  readonly value: T;
};

export type Err<E> = {
  readonly status: "error";
  readonly error: E;
};

export type Result<T, E = never> = Ok<T> | Err<E>;

export type InferOk<R> = R extends Ok<infer T> ? T : never;
export type InferErr<R> = R extends Err<infer E> ? E : never;

// =============================================================================
// Constructors & Guards
// =============================================================================

export function ok(): Ok<undefined>;
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value?: T): Ok<T | undefined> {
  return { status: "ok", value };
}

export function err(): Err<undefined>;
export function err<E>(error: E): Err<E>;
export function err<E>(error?: E): Err<E | undefined> {
  return { status: "error", error };
}

function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.status === "ok";
}

function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.status === "error";
}

/**
 * Guard for untrusted input (parsed JSON, foreign RPC).
 * A missing `value`/`error` key is valid: JSON transports drop undefined-valued keys.
 */
function isResult(value: unknown): value is Result<unknown, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    "status" in value &&
    ((value as { status: unknown }).status === "ok" ||
      (value as { status: unknown }).status === "error")
  );
}

// =============================================================================
// Transforms (data-first)
// =============================================================================

function map<T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.status === "ok" ? ok(fn(result.value)) : result;
}

function mapError<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  return result.status === "error" ? err(fn(result.error)) : result;
}

function andThen<T, E, U, F>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return result.status === "ok" ? fn(result.value) : result;
}

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.status === "error") {
    throw new Panic("Called Result.unwrap on an Err", result.error);
  }
  return result.value;
}

function unwrapOr<T, E, U>(result: Result<T, E>, fallback: U): T | U {
  return result.status === "ok" ? result.value : fallback;
}

// =============================================================================
// Exception Boundaries
// =============================================================================

function trySync<T, E>(options: {
  try: () => T;
  catch: (cause: unknown) => E;
}): Result<T, E> {
  try {
    return ok(options.try());
  } catch (cause) {
    if (isPanic(cause)) throw cause;
    return err(options.catch(cause));
  }
}

async function tryPromise<T, E>(options: {
  try: () => PromiseLike<T>;
  catch: (cause: unknown) => E;
}): Promise<Result<T, E>> {
  try {
    return ok(await options.try());
  } catch (cause) {
    if (isPanic(cause)) throw cause;
    return err(options.catch(cause));
  }
}

/**
 * An unrecoverable defect (a bug), as opposed to an expected Err.
 * Class semantics are fine here: a Panic is thrown, never returned,
 * and must never cross a serialization boundary.
 */
export class Panic extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "Panic";
  }
}

export function isPanic(value: unknown): value is Panic {
  return value instanceof Panic;
}

/**
 * Yieldable adapter passed to a Result.gen body: unwraps Ok, short-circuits Err.
 *
 * The adapter (not the Result) carries `Symbol.iterator`, and it is consumed
 * synchronously inside the generator body - it never crosses a boundary,
 * which is what keeps Results themselves boundary-safe.
 */
export type GenAdapter = <T, E>(
  result: Result<T, E>,
) => Generator<Err<E>, T, unknown>;

function* unwrapResult<T, E>(
  result: Result<T, E>,
): Generator<Err<E>, T, unknown> {
  if (result.status === "error") {
    yield result;
    throw new Panic("Unreachable: generator resumed after an Err was yielded");
  }
  return result.value;
}

/**
 * Railway composition over an async generator body.
 *
 * The body receives the yieldable adapter `$`: `yield* $(result)` unwraps Ok values
 * and short-circuits on the first Err; the body returns a Result. 
 *
 * The error type is the union of every yielded and returned Err.
 *
 * @example
 * ```js
 * Result.gen(async function* ($) {
 *   const value = yield* $(await fetchThing(id));
 *   return Result.ok(value);
 * });
 * ```
 */
async function gen<
  Yielded extends Err<unknown>,
  Returned extends Result<unknown, unknown>,
>(
  body: ($: GenAdapter) => AsyncGenerator<Yielded, Returned, unknown>,
): Promise<Result<InferOk<Returned>, InferErr<Returned> | InferErr<Yielded>>> {
  type Out = Result<InferOk<Returned>, InferErr<Returned> | InferErr<Yielded>>;

  const iterator = body(unwrapResult);
  let state: IteratorResult<Yielded, Returned>;
  try {
    state = await iterator.next();
  } catch (cause) {
    if (isPanic(cause)) throw cause;
    throw new Panic("Result.gen body threw instead of returning an Err", cause);
  }

  if (!state.done) {
    // First yielded Err short-circuits; close the generator without resuming
    const shortCircuit = state.value;
    try {
      await iterator.return(undefined as never);
    } catch (cause) {
      throw new Panic("Result.gen cleanup threw", cause);
    }
    return shortCircuit as Out;
  }

  return state.value as Out;
}

export type Tagged<Tag extends string> = { readonly _tag: Tag };

export function isTagged<Tag extends string>(
  value: unknown,
  tag: Tag,
): value is Tagged<Tag> {
  return (
    typeof value === "object" &&
    value !== null &&
    "_tag" in value &&
    (value as { _tag: unknown })._tag === tag
  );
}

/**
 * Attach a diagnostic cause as a NON-enumerable property.
 *
 * Readable in server-side code and logs, invisible to spread/JSON/Flight,
 * so arbitrary (often unserializable, often sensitive) causes never cross a boundary.
 */
export function withCause<T extends object>(error: T, cause: unknown): T {
  if (cause !== undefined) {
    Object.defineProperty(error, "cause", {
      value: cause,
      enumerable: false,
      configurable: true,
    });
  }
  return error;
}

export const Result = {
  ok,
  err,
  isOk,
  isErr,
  is: isResult,
  map,
  mapError,
  andThen,
  unwrap,
  unwrapOr,
  try: trySync,
  tryPromise,
  gen,
} as const;

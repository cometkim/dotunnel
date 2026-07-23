import assert from "node:assert/strict";
import { test } from "node:test";

import { Result, Panic, isTagged, withCause } from "flight-result";

test("results are plain data", () => {
  const okResult = Result.ok(42);
  assert.strictEqual(Object.getPrototypeOf(okResult), Object.prototype);
  // @ts-expect-error
  assert.strictEqual(okResult[Symbol.iterator], undefined);
  assert.deepStrictEqual(okResult, { status: "ok", value: 42 });
  assert.deepStrictEqual(Result.err("boom"), { status: "error", error: "boom" });
});

test("native serialization round-trips", () => {
  const original = Result.ok({ id: 1, items: [1, 2] });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(original)), original);
  assert.deepStrictEqual(structuredClone(original), original);

  // Ok<void>: JSON drops the undefined value key; the guard tolerates it
  const voidWire = JSON.parse(JSON.stringify(Result.ok()));
  assert.deepStrictEqual(voidWire, { status: "ok" });
  assert.ok(Result.is(voidWire));
  assert.ok(!Result.is({ status: "nope" }));
  assert.ok(!Result.is(null));
});

test("guards and transforms", () => {
  const okResult = Result.ok(2);
  assert.ok(Result.isOk(okResult));
  assert.deepStrictEqual(Result.map(okResult, (n) => n * 2), Result.ok(4));
  assert.deepStrictEqual(
    Result.andThen(okResult, (n) => Result.ok(String(n))),
    Result.ok("2"),
  );

  const errResult = Result.err("bad");
  assert.ok(Result.isErr(errResult));
  assert.deepStrictEqual(Result.map(errResult, (n) => n), errResult);
  assert.deepStrictEqual(
    Result.mapError(errResult, (e) => `${e}!`),
    Result.err("bad!"),
  );
  assert.strictEqual(Result.unwrapOr(errResult, 0), 0);
  assert.throws(() => Result.unwrap(errResult), Panic);
});

test("try boundaries", async () => {
  const okSync = Result.try({ try: () => 1, catch: () => "nope" });
  assert.deepStrictEqual(okSync, Result.ok(1));
  const errSync = Result.try({
    try: () => {
      throw new Error("x");
    },
    catch: (cause) => `caught ${(cause as Error).message}`,
  });
  assert.deepStrictEqual(errSync, Result.err("caught x"));

  const errAsync = await Result.tryPromise({
    try: () => Promise.reject(new Error("y")),
    catch: (cause) => (cause as Error).message,
  });
  assert.deepStrictEqual(errAsync, Result.err("y"));
});

test("gen composes and short-circuits", async () => {
  const okFlow = await Result.gen(async function* ($) {
    const a = yield* $(Result.ok(1));
    const b = yield* $(await Promise.resolve(Result.ok(2)));
    return Result.ok(a + b);
  });
  assert.deepStrictEqual(okFlow, Result.ok(3));

  let reached = false;
  const errFlow = await Result.gen(async function* ($) {
    const a = yield* $(Result.ok(1));
    const b = yield* $<number, string>(Result.err("halt"));
    reached = true;
    return Result.ok(a + b);
  });
  assert.deepStrictEqual(errFlow, Result.err("halt"));
  assert.strictEqual(reached, false);

  const returnedErr = await Result.gen(async function* ($) {
    yield* $(Result.ok(1));
    return Result.err("direct");
  });
  assert.deepStrictEqual(returnedErr, Result.err("direct"));
});

test("gen escalates thrown exceptions to Panic", async () => {
  await assert.rejects(
    Result.gen(async function* ($) {
      yield* $(Result.ok(1));
      throw new Error("bug");
    }),
    Panic,
  );
});

test("tagged errors with hidden cause", () => {
  const error = withCause(
    { _tag: "DatabaseError", operation: "insert", message: "failed" },
    new Error("SQLITE_BUSY"),
  );
  assert.ok(isTagged(error, "DatabaseError"));
  assert.ok(!isTagged(error, "OtherError"));

  // cause is readable server-side...
  assert.strictEqual((error as { cause?: Error }).cause?.message, "SQLITE_BUSY");
  // ...but never crosses a boundary
  assert.ok(!JSON.stringify(error).includes("SQLITE_BUSY"));
  assert.ok(!Object.keys(error).includes("cause"));
  assert.deepStrictEqual({ ...error }, {
    _tag: "DatabaseError",
    operation: "insert",
    message: "failed",
  });
});

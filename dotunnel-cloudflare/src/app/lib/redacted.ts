/**
 * Redacted<T> - a wrapper for secret values (API keys, client secrets, tokens).
 *
 * The wrapped value lives in a module-private WeakMap, NOT as a property of
 * the instance. This means no enumeration, spread, JSON serialization, or
 * structured clone can ever reach it. The only way to read the value is an
 * explicit `Redacted.value()` call, which makes every secret exposure
 * greppable and reviewable.
 *
 * Failure modes are deliberately loud:
 * - `JSON.stringify` on anything containing a Redacted throws (via `toJSON`),
 *   so accidentally persisting or logging a wrapped secret fails immediately
 *   instead of silently writing "<redacted>" garbage.
 * - Passing a Redacted across the RSC boundary (client component props or
 *   "use server" return values) throws in React Flight, since class
 *   instances are not serializable.
 * - `console.log` / string interpolation render "<redacted>".
 */

const values = new WeakMap<Redacted<unknown>, unknown>();

const REDACTED_LABEL = "<redacted>";

export class Redacted<T> {
  // Phantom field: makes Redacted<string> and Redacted<number> incompatible
  // and blocks structural forgery. `declare` emits no runtime code.
  private declare readonly __value: T;

  private constructor() {}

  /**
   * Wrap a secret value. This is the only way to construct a Redacted.
   */
  static make<T>(value: T): Redacted<T> {
    const redacted = new Redacted<T>();
    values.set(redacted, value);
    return redacted;
  }

  /**
   * Reveal the wrapped value. Call this ONLY at explicit boundaries where
   * the secret is actually consumed (persistence, outgoing auth requests).
   */
  static value<T>(redacted: Redacted<T>): T {
    if (!values.has(redacted)) {
      throw new TypeError(
        "Redacted.value() called on a value that is not a live Redacted instance",
      );
    }
    return values.get(redacted) as T;
  }

  static is(value: unknown): value is Redacted<unknown> {
    return value instanceof Redacted && values.has(value);
  }

  toString(): string {
    return REDACTED_LABEL;
  }

  toJSON(): never {
    throw new Error(
      "Attempted to serialize a Redacted value to JSON. " +
        "Reveal it explicitly with Redacted.value() at the boundary that needs it.",
    );
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED_LABEL;
  }
}

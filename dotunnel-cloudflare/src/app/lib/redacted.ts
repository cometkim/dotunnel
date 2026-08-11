/**
 * Redacted<T> - a wrapper for secret values (API keys, client secrets, tokens).
 *
 * The wrapped value lives in a JS #private field: not an own property, so no
 * enumeration, spread, JSON serialization, or structured clone can ever reach
 * it. The only way to read the value is an explicit `Redacted.value()` call,
 * which makes every secret exposure greppable and reviewable.
 *
 * Failure modes are deliberately loud:
 * - `JSON.stringify` on anything containing a Redacted throws (via `toJSON`),
 *   so accidentally persisting or logging a wrapped secret fails immediately
 *   instead of silently writing "<redacted>" garbage.
 * - Passing a Redacted across the RSC boundary (client component props or
 *   "use server" return values) throws in React Flight, since class
 *   instances are not serializable.
 * - `console.log` / string interpolation render "<redacted>".
 *
 * The #private field also makes the type nominal: a structurally-forged
 * object neither satisfies `Redacted<T>` in TypeScript nor passes the
 * runtime `#value in` brand checks.
 */

const REDACTED_LABEL = "<redacted>";

export class Redacted<T> {
  #value: T;

  constructor(value: T) {
    this.#value = value;
  }

  /**
   * Wrap a secret value.
   */
  static make<T>(value: T): Redacted<T> {
    return new Redacted(value);
  }

  /**
   * Reveal the wrapped value. Call this ONLY at explicit boundaries where
   * the secret is actually consumed (persistence, outgoing auth requests).
   */
  static value<T>(redacted: Redacted<T>): T {
    if (!(#value in redacted)) {
      throw new TypeError(
        "Redacted.value() called on a value that is not a Redacted instance",
      );
    }
    return redacted.#value;
  }

  static is(value: unknown): value is Redacted<unknown> {
    return typeof value === "object" && value !== null && #value in value;
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

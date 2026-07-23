import { isTagged, type Tagged, withCause } from "flight-result";

/**
 * Domain errors are fully structural: plain tagged objects, no Error class.
 * They cross RSC/JSON boundaries as-is, `_tag` narrows discriminated unions
 * natively, and diagnostic `cause` values are attached non-enumerably via
 * withCause - readable in server logs, never serialized to the client.
 */

// =============================================================================
// Infrastructure Errors
// =============================================================================

/**
 * Service has not been bootstrapped yet.
 * Config is missing from database.
 */
export type NotBootstrappedError = Tagged<"NotBootstrappedError"> & {
  readonly message: string;
};

export const NotBootstrappedError = Object.assign(
  (): NotBootstrappedError => ({
    _tag: "NotBootstrappedError",
    message: "Service is not bootstrapped",
  }),
  {
    is: (value: unknown): value is NotBootstrappedError =>
      isTagged(value, "NotBootstrappedError"),
  },
);

/**
 * Database operation failed.
 */
export type DatabaseError = Tagged<"DatabaseError"> & {
  readonly operation: string;
  readonly message: string;
};

export const DatabaseError = Object.assign(
  (args: { operation: string; cause: unknown }): DatabaseError => {
    const msg =
      args.cause instanceof Error ? args.cause.message : String(args.cause);
    const error: DatabaseError = {
      _tag: "DatabaseError",
      operation: args.operation,
      message: `Database ${args.operation} failed: ${msg}`,
    };
    return withCause(error, args.cause);
  },
  {
    is: (value: unknown): value is DatabaseError =>
      isTagged(value, "DatabaseError"),
  },
);

// =============================================================================
// Auth Errors
// =============================================================================

/**
 * User is not authenticated.
 */
export type AuthRequiredError = Tagged<"AuthRequiredError"> & {
  readonly message: string;
};

export const AuthRequiredError = Object.assign(
  (): AuthRequiredError => ({
    _tag: "AuthRequiredError",
    message: "Authentication required",
  }),
  {
    is: (value: unknown): value is AuthRequiredError =>
      isTagged(value, "AuthRequiredError"),
  },
);

// =============================================================================
// Validation Errors
// =============================================================================

/**
 * Input validation failed.
 */
export type ValidationError = Tagged<"ValidationError"> & {
  readonly field?: string;
  readonly message: string;
};

export const ValidationError = Object.assign(
  (args: { field?: string; message: string }): ValidationError => ({
    _tag: "ValidationError",
    ...args,
  }),
  {
    is: (value: unknown): value is ValidationError =>
      isTagged(value, "ValidationError"),
  },
);

// =============================================================================
// Resource Errors
// =============================================================================

/**
 * Resource was not found.
 */
export type NotFoundError = Tagged<"NotFoundError"> & {
  readonly resource: string;
  readonly id?: string;
  readonly message: string;
};

export const NotFoundError = Object.assign(
  (args: { resource: string; id?: string }): NotFoundError => ({
    _tag: "NotFoundError",
    ...args,
    message: args.id
      ? `${args.resource} not found: ${args.id}`
      : `${args.resource} not found`,
  }),
  {
    is: (value: unknown): value is NotFoundError =>
      isTagged(value, "NotFoundError"),
  },
);

/**
 * Resource already exists (conflict).
 */
export type ConflictError = Tagged<"ConflictError"> & {
  readonly resource: string;
  readonly message: string;
};

export const ConflictError = Object.assign(
  (args: { resource: string; message: string }): ConflictError => ({
    _tag: "ConflictError",
    ...args,
  }),
  {
    is: (value: unknown): value is ConflictError =>
      isTagged(value, "ConflictError"),
  },
);

/**
 * User doesn't have permission to perform action.
 */
export type PermissionError = Tagged<"PermissionError"> & {
  readonly action: string;
  readonly resource: string;
  readonly message: string;
};

export const PermissionError = Object.assign(
  (args: { action: string; resource: string }): PermissionError => ({
    _tag: "PermissionError",
    ...args,
    message: `Permission denied: cannot ${args.action} ${args.resource}`,
  }),
  {
    is: (value: unknown): value is PermissionError =>
      isTagged(value, "PermissionError"),
  },
);

// =============================================================================
// Error Unions
// =============================================================================

/**
 * Common errors for tunnel operations.
 */
export type TunnelError =
  | AuthRequiredError
  | ValidationError
  | NotFoundError
  | ConflictError
  | PermissionError
  | DatabaseError;

/**
 * Common errors for admin/config operations.
 */
export type AdminError = ValidationError | DatabaseError;

import { TaggedError } from "better-result";

// =============================================================================
// Infrastructure Errors
// =============================================================================

/**
 * Service has not been bootstrapped yet.
 * Config is missing from database.
 */
export class NotBootstrappedError extends TaggedError("NotBootstrappedError")<{
  message: string;
}>() {
  constructor() {
    super({ message: "Service is not bootstrapped" });
  }
}

/**
 * Database operation failed.
 */
export class DatabaseError extends TaggedError("DatabaseError")<{
  operation: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { operation: string; cause: unknown }) {
    const msg =
      args.cause instanceof Error ? args.cause.message : String(args.cause);
    super({ ...args, message: `Database ${args.operation} failed: ${msg}` });
  }
}

// =============================================================================
// Auth Errors
// =============================================================================

/**
 * User is not authenticated.
 */
export class AuthRequiredError extends TaggedError("AuthRequiredError")<{
  message: string;
}>() {
  constructor() {
    super({ message: "Authentication required" });
  }
}

// =============================================================================
// Validation Errors
// =============================================================================

/**
 * Input validation failed.
 */
export class ValidationError extends TaggedError("ValidationError")<{
  field?: string;
  message: string;
}>() {}

// =============================================================================
// Resource Errors
// =============================================================================

/**
 * Resource was not found.
 */
export class NotFoundError extends TaggedError("NotFoundError")<{
  resource: string;
  id?: string;
  message: string;
}>() {
  constructor(args: { resource: string; id?: string }) {
    const msg = args.id
      ? `${args.resource} not found: ${args.id}`
      : `${args.resource} not found`;
    super({ ...args, message: msg });
  }
}

/**
 * Resource already exists (conflict).
 */
export class ConflictError extends TaggedError("ConflictError")<{
  resource: string;
  message: string;
}>() {}

/**
 * User doesn't have permission to perform action.
 */
export class PermissionError extends TaggedError("PermissionError")<{
  action: string;
  resource: string;
  message: string;
}>() {
  constructor(args: { action: string; resource: string }) {
    super({
      ...args,
      message: `Permission denied: cannot ${args.action} ${args.resource}`,
    });
  }
}

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

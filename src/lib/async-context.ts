import { AsyncLocalStorage } from "node:async_hooks";

/**
 * AsyncLocalStorage for request-scoped context
 * This allows us to access the current request ID from anywhere in the code
 * without explicitly passing it through function parameters
 */
export const requestContext = new AsyncLocalStorage<string>();

/**
 * Get the current request ID from async context
 * Returns undefined if not in a request context
 */
export function getRequestId(): string | undefined {
  return requestContext.getStore();
}

/**
 * Error handler utility for handling errors in the application
 * This is used instead of try-catch blocks as per project requirements
 */

type ErrorCallback = (error: Error) => void;

/**
 * Executes a function and handles any errors that occur
 * @param fn The function to execute
 * @param onError Optional callback to handle errors
 * @returns The result of the function or undefined if an error occurred
 */
export function errorHandler<T>(
  fn: () => T,
  onError?: ErrorCallback
): T | undefined {
  try {
    return fn();
  } catch (error) {
    if (onError && error instanceof Error) {
      onError(error);
    } else if (error instanceof Error) {
      console.error("Error:", error.message);
    } else {
      console.error("Unknown error:", error);
    }
    return undefined;
  }
}

/**
 * Executes an async function and handles any errors that occur
 * @param fn The async function to execute
 * @param onError Optional callback to handle errors
 * @returns A promise that resolves to the result of the function or undefined if an error occurred
 */
export async function asyncErrorHandler<T>(
  fn: () => Promise<T>,
  onError?: ErrorCallback
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    if (onError && error instanceof Error) {
      onError(error);
    } else if (error instanceof Error) {
      console.error("Error:", error.message);
    } else {
      console.error("Unknown error:", error);
    }
    return undefined;
  }
}

export default {
  errorHandler,
  asyncErrorHandler,
}; 
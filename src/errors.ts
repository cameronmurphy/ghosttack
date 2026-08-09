/** A problem with a stack file or the arguments given to ghosttack. */
export class GhosttackError extends Error {
  override name = 'GhosttackError';
}

/**
 * Reject bad input. This throws rather than exiting so that parsing and
 * validation stay testable; main.ts turns it into a clean exit.
 */
export function fail(msg: string): never {
  throw new GhosttackError(msg);
}

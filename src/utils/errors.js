/**
 * Error-response helpers.
 *
 * Contract (backward compatible with released apps): error responses keep a string
 * `error` field and their existing status codes; `code` is added for new clients.
 * Raw provider/exception messages and validation internals are never sent to clients.
 */

/** Stable code for an unexpected error: AiServiceError codes pass through, everything else is INTERNAL_ERROR. */
function errorCode(err) {
  return err && typeof err.code === 'string' && err.code.startsWith('AI_') ? err.code : 'INTERNAL_ERROR';
}

module.exports = { errorCode };

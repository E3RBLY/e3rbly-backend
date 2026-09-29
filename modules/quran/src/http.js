/** Error envelope shared by this module: { error: { code, message, details? } }. */
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const envelope = (code, message, details) => ({ error: { code, message, ...(details ? { details } : {}) } });

module.exports = { ApiError, envelope };

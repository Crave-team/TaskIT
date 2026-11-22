/**
 * Errors the services throw. `status` mirrors the HTTP status an Express error handler would
 * send, and `code` is a stable machine-readable string the UI can switch on.
 */
export class ApiError extends Error {
  constructor(status, code, message, field = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
  toJSON() {
    return { status: this.status, code: this.code, message: this.message, field: this.field };
  }
}

export const badRequest = (message, field) => new ApiError(400, 'BAD_REQUEST', message, field);
export const unauthorized = (message = 'Please log in.') => new ApiError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You are not allowed to do that.') => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (message, field) => new ApiError(409, 'CONFLICT', message, field);

import { ApiError } from '../../../src/api/errors.js';

/**
 * One place that turns any failure into a JSON response `{ error: { status, code, message, field } }`.
 * Service errors keep their own status; database and parsing problems are mapped; anything unexpected is
 * logged in full on the server but only a generic message goes to the client (no stack traces, no internals).
 */
export function errorHandler(logger = console) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    let status = 500;
    let code = 'INTERNAL';
    let message = 'Something went wrong on our side. Please try again.';
    let field;

    if (err instanceof ApiError) {
      ({ status, code, message, field } = err);
    } else if (err?.type === 'entity.too.large') {
      status = 413; code = 'TOO_LARGE'; message = 'That request is too large.';
    } else if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      status = 400; code = 'BAD_REQUEST'; message = 'The request body is not valid JSON.';
    } else if (err?.code === 'LIMIT_FILE_SIZE') {
      status = 400; code = 'BAD_REQUEST'; message = 'That file is too large.';
    } else if (err?.name === 'MulterError') {
      status = 400; code = 'BAD_REQUEST'; message = 'The upload could not be processed.';
    } else if (err?.code === 11000) {
      status = 409; code = 'CONFLICT'; message = 'That already exists.';
    } else if (err instanceof TypeError || err?.name === 'ValidationError' || err?.name === 'StrictModeError' || err?.name === 'CastError') {
      // Wrong-shaped input that slipped past a service's own checks. Log it (it may point at a missing check).
      status = 400; code = 'BAD_REQUEST'; message = 'Invalid request.';
      logger.warn?.(`[400] ${req.method} ${req.path}: ${err.name}: ${err.message}`);
    } else {
      logger.error?.(`[500] ${req.method} ${req.path}`, err);
    }
    if (res.headersSent) return;
    res.status(status).json({ error: { status, code, message, ...(field ? { field } : {}) } });
  };
}

export class AppError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.status = 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  code: AppErrorCode;
  httpStatus: number;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = STATUS_BY_CODE[code];
    Error.captureStackTrace(this, AppError);
  }

  static badRequest(message: string) {
    return new AppError('BAD_REQUEST', message);
  }
  static unauthorized(message = 'Unauthorized') {
    return new AppError('UNAUTHORIZED', message);
  }
  static forbidden(message = 'Forbidden') {
    return new AppError('FORBIDDEN', message);
  }
  static notFound(message: string) {
    return new AppError('NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new AppError('CONFLICT', message);
  }
}

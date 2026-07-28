import { AppError } from '../utils/errors.js';

export default function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      }
    });
  }

  console.error('Unhandled Error in Gateway Orchestrator:', err);

  return res.status(500).json({
    status: 'error',
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan internal pada gateway orchestrator',
      details: process.env.NODE_ENV === 'development' ? err.message : null
    }
  });
}

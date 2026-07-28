import jwt from 'jsonwebtoken';
import { getPublicKey } from '../config/keys.js';
import { AppError } from '../utils/errors.js';

/**
 * Middleware to verify JWT token at the API Gateway.
 * It extracts claims (userId, role, empId) and attaches them to req.user for forwarding.
 */
export default function jwtGatewayVerify(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHORIZED', 'Token otentikasi tidak disediakan', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const publicKey = getPublicKey();
    // Verify using RS256 algorithm
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

    // Populate req.user
    req.user = {
      userId: decoded.sub,
      role: decoded.role,
      empId: decoded.emp_id ? parseInt(decoded.emp_id, 10) : null
    };

    next();
  } catch (error) {
    let message = 'Token otentikasi tidak valid';
    if (error.name === 'TokenExpiredError') {
      message = 'Token otentikasi sudah kedaluwarsa';
    }
    next(new AppError('UNAUTHORIZED', message, 401));
  }
}

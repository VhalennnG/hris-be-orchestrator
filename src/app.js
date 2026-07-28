import express from 'express';
import cors from 'cors';
import jwtGatewayVerify from './middlewares/jwt-gateway-verify.js';
import errorHandler from './middlewares/error-handler.js';
import { authProxy, coreProxy } from './services/proxy-service.js';
import { AppError } from './utils/errors.js';

const app = express();

// Global Middlewares (CORS is needed, but we DO NOT parse express.json() globally here
// because parsing the body can break http-proxy-middleware streaming of raw body payload!)
// This is a known and critical rule of using http-proxy-middleware: 
// if you parse req.body, you must use proxy events to re-stream it, or simply do not parse it at all on the proxy gateway.
// Since the gateway is a thin proxy and doesn't read request body, NOT parsing express.json() is the best, cleanest approach!
app.use(cors());

// 1. PUBLIC routes
app.post('/api/v1/auth/login', authProxy);

// 2. PROTECTED routes (requires JWT local verification)
app.use('/api/v1/auth', jwtGatewayVerify, authProxy);
app.use('/api/v1/employees', jwtGatewayVerify, coreProxy);
app.use('/api/v1/org-chart', jwtGatewayVerify, coreProxy);

// Fallback for undefined paths
app.use('*', (req, res, next) => {
  next(new AppError('NOT_FOUND', `Route ${req.originalUrl} tidak ditemukan`, 404));
});

// Global Error Handler
app.use(errorHandler);

export default app;

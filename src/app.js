import express from 'express';
import cors from 'cors';
import jwtGatewayVerify from './middlewares/jwt-gateway-verify.js';
import errorHandler from './middlewares/error-handler.js';
import { authProxy, coreEmployeesProxy, coreOrgChartProxy } from './services/proxy-service.js';
import { AppError } from './utils/errors.js';

const app = express();

app.use(cors());

// Diagnostic logging middleware
app.use((req, res, next) => {
  console.log(`[Gateway] Received request: ${req.method} ${req.originalUrl} (req.url: ${req.url})`);
  next();
});

// 1. PUBLIC login endpoint (No prefix is stripped on direct routing via app.post)
app.post('/api/v1/auth/login', authProxy);

// 2. PROTECTED routes (requires JWT verification at gateway)
app.use('/api/v1/auth', jwtGatewayVerify, authProxy);
app.use('/api/v1/employees', jwtGatewayVerify, coreEmployeesProxy);
app.use('/api/v1/org-chart', jwtGatewayVerify, coreOrgChartProxy);

// Fallback for undefined paths
app.use('*', (req, res, next) => {
  next(new AppError('NOT_FOUND', `Route ${req.originalUrl} tidak ditemukan`, 404));
});

// Global Error Handler
app.use(errorHandler);

export default app;

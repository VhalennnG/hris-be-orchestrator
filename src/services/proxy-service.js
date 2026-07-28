import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';

dotenv.config();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:4002';
const CORE_SERVICE_URL = process.env.CORE_SERVICE_URL || 'http://localhost:4001';

// Common error handler for proxy failures (downstream outages)
const handleProxyError = (err, req, res) => {
  console.error(`Proxy error connecting to downstream:`, err.message);
  res.status(503).json({
    status: 'error',
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service downstream tidak dapat dihubungi atau sedang sibuk',
      details: err.message
    }
  });
};

// Common request decorator to inject trusted headers and strip client-spoofed headers
const decorateProxyReq = (proxyReq, req, res) => {
  // 1. Strip any client-spoofed headers to ensure security
  proxyReq.removeHeader('X-User-Id');
  proxyReq.removeHeader('X-User-Role');
  proxyReq.removeHeader('X-Emp-Id');

  // 2. Inject trusted headers from verified req.user claims
  if (req.user) {
    proxyReq.setHeader('X-User-Id', req.user.userId);
    proxyReq.setHeader('X-User-Role', req.user.role);
    if (req.user.empId) {
      proxyReq.setHeader('X-Emp-Id', req.user.empId.toString());
    }
  }
};

// 1. Auth Proxy configuration
export const authProxy = createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: decorateProxyReq,
    error: handleProxyError
  }
});

// 2. Core Proxy configuration
export const coreProxy = createProxyMiddleware({
  target: CORE_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: decorateProxyReq,
    error: handleProxyError
  }
});

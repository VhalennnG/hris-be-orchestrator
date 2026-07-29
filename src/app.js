import express from 'express';
import cors from 'cors';
import jwtGatewayVerify from './middlewares/jwt-gateway-verify.js';
import errorHandler from './middlewares/error-handler.js';
import { authProxy, coreEmployeesProxy, coreOrgChartProxy } from './services/proxy-service.js';
import { AppError } from './utils/errors.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// 3. SWAGGER API DOCS
app.get('/docs/openapi.yaml', (req, res) => {
  const yamlPath = path.join(__dirname, '../docs/api/openapi.yaml');
  if (fs.existsSync(yamlPath)) {
    res.setHeader('Content-Type', 'text/yaml');
    res.sendFile(yamlPath);
  } else {
    res.status(404).send('OpenAPI spec not found');
  }
});

app.get('/docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>HRIS API Gateway Documentation</title>
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" charset="UTF-8"></script>
      <script>
        window.onload = () => {
          window.ui = SwaggerUIBundle({
            url: '/docs/openapi.yaml',
            dom_id: '#swagger-ui',
          });
        };
      </script>
    </body>
    </html>
  `);
});

app.get('/api-docs', (req, res) => {
  res.redirect('/docs');
});

// Fallback for undefined paths
app.use('*', (req, res, next) => {
  next(new AppError('NOT_FOUND', `Route ${req.originalUrl} tidak ditemukan`, 404));
});

// Global Error Handler
app.use(errorHandler);

export default app;

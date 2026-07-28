import test from 'node:test';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import jwtGatewayVerify from '../src/middlewares/jwt-gateway-verify.js';

test('Gateway Security Middlewares', async (t) => {
  // Load private key for test token signing
  let privateKey = null;
  try {
    privateKey = fs.readFileSync(path.resolve(process.cwd(), 'keys/private_key.pem'), 'utf8');
  } catch (error) {
    console.warn('Warning: private_key.pem not found for testing. Some tests will be skipped.');
  }

  await t.test('jwtGatewayVerify with valid token', async () => {
    if (!privateKey) return;

    const payload = {
      sub: '1000000',
      role: 'superadmin',
      emp_id: 1000001
    };

    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };
    const res = {};
    let nextCalled = false;
    let nextError = null;

    const next = (err) => {
      nextCalled = true;
      nextError = err;
    };

    jwtGatewayVerify(req, res, next);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(nextError, null);
    assert.deepStrictEqual(req.user, {
      userId: '1000000',
      role: 'superadmin',
      empId: 1000001
    });
  });

  await t.test('jwtGatewayVerify with missing token', async () => {
    const req = {
      headers: {}
    };
    const res = {};
    let nextError = null;
    const next = (err) => {
      nextError = err;
    };

    jwtGatewayVerify(req, res, next);

    assert.ok(nextError);
    assert.strictEqual(nextError.code, 'UNAUTHORIZED');
    assert.strictEqual(nextError.statusCode, 401);
  });

  await t.test('jwtGatewayVerify with invalid token signature', async () => {
    const req = {
      headers: {
        authorization: 'Bearer invalid-token-string'
      }
    };
    const res = {};
    let nextError = null;
    const next = (err) => {
      nextError = err;
    };

    jwtGatewayVerify(req, res, next);

    assert.ok(nextError);
    assert.strictEqual(nextError.code, 'UNAUTHORIZED');
    assert.strictEqual(nextError.statusCode, 401);
  });
});

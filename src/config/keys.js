import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

let publicKey = null;

/**
 * Loads and returns the RSA Public Key for verifying JWT signatures.
 * 
 * @returns {string} The public key PEM string
 */
export function getPublicKey() {
  if (publicKey) return publicKey;

  const keyPath = process.env.AUTH_PUBLIC_KEY_PATH || 'keys/public_key.pem';
  const absolutePath = path.isAbsolute(keyPath)
    ? keyPath
    : path.resolve(process.cwd(), keyPath);

  try {
    publicKey = fs.readFileSync(absolutePath, 'utf8');
    return publicKey;
  } catch (error) {
    console.error(`Failed to read public key from ${absolutePath}:`, error.message);
    throw new Error('JWT Public Key configuration error in Orchestrator.');
  }
}

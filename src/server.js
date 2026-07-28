import app from './app.js';
import { getPublicKey } from './config/keys.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 4000;

function startServer() {
  try {
    // Verify public key loading at startup to catch configurations errors early
    getPublicKey();
    console.log('[hris-be-orchestrator] Public Key loaded successfully.');

    app.listen(PORT, () => {
      console.log(`[hris-be-orchestrator] API Gateway is running successfully on port ${PORT}`);
    });
  } catch (error) {
    console.error('Fatal error during Gateway Orchestrator startup:', error.message);
    process.exit(1);
  }
}

startServer();

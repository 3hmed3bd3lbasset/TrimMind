import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// ============================================================================
// Centralized Invariant Security Secrets Validator (No Hardcoded Fallback)
// ============================================================================

let derivedJwtSecret: string;
const rawJwtSecret = process.env.JWT_SECRET;

if (rawJwtSecret && rawJwtSecret.trim() !== '') {
  derivedJwtSecret = rawJwtSecret.trim();
} else {
  // Generate high-entropy 256-bit ephemeral secret in RAM (Zero Hardcoded Keys)
  derivedJwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn(
    '⚠️ [SECURITY NOTICE] JWT_SECRET was not found in environment variables. Generated high-entropy ephemeral 256-bit secret in RAM for this runtime instance.'
  );
}

let derivedAgentSecret: string;
const rawAgentSecret = process.env.AGENT_API_SECRET || process.env.WHATSAPP_AGENT_SECRET;

if (rawAgentSecret && rawAgentSecret.trim() !== '') {
  derivedAgentSecret = rawAgentSecret.trim();
} else {
  derivedAgentSecret = crypto.randomBytes(32).toString('hex');
  console.warn(
    '⚠️ [SECURITY NOTICE] AGENT_API_SECRET was not found in environment variables. Generated high-entropy ephemeral 256-bit secret in RAM for this runtime instance.'
  );
}

export const JWT_SECRET: string = derivedJwtSecret;
export const AGENT_API_SECRET: string = derivedAgentSecret;

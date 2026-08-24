import dotenv from 'dotenv';
dotenv.config();

// ============================================================================
// Centralized Invariant Security Secrets Validator
// ============================================================================

const rawJwtSecret = process.env.JWT_SECRET;

if (!rawJwtSecret || rawJwtSecret.trim() === '') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production! Server refusing to start.');
  } else {
    console.warn('⚠️ [SECURITY WARNING] JWT_SECRET is not set in environment. Enforce JWT_SECRET before deployment.');
  }
}

export const JWT_SECRET: string =
  rawJwtSecret && rawJwtSecret.trim() !== ''
    ? rawJwtSecret.trim()
    : 'dev_local_only_jwt_secret_must_change_in_production_min_32_chars';

const rawAgentSecret = process.env.AGENT_API_SECRET || process.env.WHATSAPP_AGENT_SECRET;

if (!rawAgentSecret || rawAgentSecret.trim() === '') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL SECURITY ERROR: AGENT_API_SECRET is missing in production! Server refusing to start.');
  }
}

export const AGENT_API_SECRET: string =
  rawAgentSecret && rawAgentSecret.trim() !== ''
    ? rawAgentSecret.trim()
    : 'dev_local_agent_secret_key_2026';

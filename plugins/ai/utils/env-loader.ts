/**
 * Environment Variables Loader
 * Loads environment variables from .env file
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

interface EnvConfig {
  api_base: string;
  api_key: string;
  model: string;
}

/**
 * Load environment variables from .env file
 */
export function loadEnvVariables(): EnvConfig {
  const envPath = resolve(process.cwd(), '.env');
  
  try {
    const content = readFileSync(envPath, 'utf-8');
    const envVars: Record<string, string> = {};
    
    // Parse .env file
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        envVars[key.trim()] = value;
      }
    }
    
    // Set environment variables
    for (const [key, value] of Object.entries(envVars)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    
    return {
      api_base: envVars['api_base'] || process.env.api_base || 'https://api.longcat.chat/openai',
      api_key: envVars['api_key'] || process.env.api_key || '',
      model: envVars['model'] || process.env.model || 'LongCat-Flash-Chat',
    };
  } catch (error) {
    console.warn('Warning: Could not load .env file, using defaults');
    return {
      api_base: process.env.api_base || 'https://api.longcat.chat/openai',
      api_key: process.env.api_key || '',
      model: process.env.model || 'LongCat-Flash-Chat',
    };
  }
}

// Load environment variables on module import
export const envConfig = loadEnvVariables();

console.log(`Environment loaded: API Base=${envConfig.api_base}, Model=${envConfig.model}, API Key available: ${!!envConfig.api_key}`);

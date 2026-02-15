import { createOpenAI } from '@ai-sdk/openai';

/**
 * LongCat provider configuration
 * Uses OpenAI-compatible API from LongCat
 */
export function createLongCat(config?: {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}) {
  const apiKey = config?.apiKey || process.env.api_key || '';
  const baseURL = config?.baseURL || process.env.api_base || 'https://api.longcat.chat/openai';
  const defaultModel = config?.model || process.env.model || 'LongCat-Flash-Chat';

  // Create OpenAI-compatible client for LongCat
  const longcat = createOpenAI({
    apiKey,
    baseURL,
  });

  return {
    client: longcat,
    model: (modelName?: string) => longcat.chat(defaultModel),
    defaultModel,
  };
}

/**
 * Available LongCat models
 */
export const LongCatModels = {
  // 500k quota daily
  FLASH_CHAT: 'LongCat-Flash-Chat',
  FLASH_THINKING: 'LongCat-Flash-Thinking',
  FLASH_THINKING_2601: 'LongCat-Flash-Thinking-2601',
  
  // 50M quota daily
  FLASH_LITE: 'LongCat-Flash-Lite',
} as const;

export type LongCatModel = typeof LongCatModels[keyof typeof LongCatModels];

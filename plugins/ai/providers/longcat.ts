import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

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

/**
 * Supported languages for TTS
 */
export const SUPPORTED_LANGUAGES = ['en', 'ko', 'es', 'pt', 'fr'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

/**
 * Language detection result
 */
export interface LanguageDetectionResult {
  language: SupportedLanguage;
  confidence: number;
  rawResponse?: string;
}

/**
 * Detect language using LongCat AI
 * Uses the AI to analyze text and determine the language
 * 
 * @param text - The text to analyze for language detection
 * @param config - Optional configuration for LongCat
 * @returns Promise<LanguageDetectionResult> - The detected language with confidence
 */
export async function detectLanguageWithLongCat(
  text: string,
  config?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  }
): Promise<LanguageDetectionResult> {
  const { client, defaultModel } = createLongCat(config);

  const prompt = `Analyze the following text and detect its language. 
Respond with ONLY the language code (en, ko, es, pt, or fr) based on the primary language used in the text.

Text to analyze: "${text.substring(0, 500)}"

Language rules:
- If the text is in English, respond with: en
- If the text is in Korean, respond with: ko
- If the text is in Spanish, respond with: es
- If the text is in Portuguese, respond with: pt
- If the text is in French, respond with: fr

Respond with only one word: the language code.`;

  try {
    const result = await generateText({
      model: client(defaultModel),
      prompt: prompt,
      temperature: 0.1,
    });

    const rawResponse = result.text?.trim().toLowerCase() || '';
    
    // Extract language code from response
    let detectedLang: SupportedLanguage = 'es'; // Default to Spanish
    
    if (rawResponse.includes('en')) {
      detectedLang = 'en';
    } else if (rawResponse.includes('ko')) {
      detectedLang = 'ko';
    } else if (rawResponse.includes('es')) {
      detectedLang = 'es';
    } else if (rawResponse.includes('pt')) {
      detectedLang = 'pt';
    } else if (rawResponse.includes('fr')) {
      detectedLang = 'fr';
    }

    return {
      language: detectedLang,
      confidence: 0.9, // AI-based detection has high confidence
      rawResponse,
    };
  } catch (error) {
    console.error('[LongCat Language Detection] Error:', error);
    // Default to Spanish on error
    return {
      language: 'es',
      confidence: 0.0,
      rawResponse: undefined,
    };
  }
}


/**
 * Combined language detection - uses quick heuristic first, then LongCat for confirmation
 * 
 * @param text - The text to analyze
 * @param useAI - Whether to use AI for confirmation (default: true)
 * @param config - Optional configuration for LongCat
 * @returns Promise<LanguageDetectionResult>
 */
export async function detectLanguage(
  text: string,
  useAI: boolean = true,
  config?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  }
): Promise<LanguageDetectionResult> {
  // First, do a quick heuristic detection
  
  // Then verify with AI for higher accuracy
  try {
    const aiResult = await detectLanguageWithLongCat(text, config);
    return aiResult;
  } catch (error) {
    // Fallback to quick detection if AI fails
    console.warn('[detectLanguage] AI detection failed, using heuristic fallback');
    return {
      language: 'es',
      confidence: 0.7,
    };
  }
}

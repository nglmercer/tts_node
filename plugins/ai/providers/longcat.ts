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
 * Quick language detection using simple heuristics
 * Used as fallback or for quick checks
 * 
 * @param text - The text to analyze
 * @returns SupportedLanguage - The detected language
 */
export function detectLanguageQuick(text: string): SupportedLanguage {
  const textLower = text.toLowerCase();
  
  // Korean detection (Korean characters) - with 'u' flag
  const koreanRegex = /[\u{AC00}-\u{D7AF}\u{1100}-\u{11FF}\u{3130}-\u{318F}]/u;
  if (koreanRegex.test(text)) {
    return 'ko';
  }
  
  // Common Spanish words and patterns
  const spanishPatterns = /\b(el|la|los|las|un|una|de|que|es|en|con|por|para|como|pero|este|esta|son|está|tiene|hace|donde|cuando|porque|cual|qué|cuándo|dónde)\b/i;
  const spanishScore = (textLower.match(/\b(el|la|los|las|un|una|de|que|es|en|con|por|para|como|pero|este|esta|son|está|tiene|hace|donde|cuando|porque|cual|qué|cuándo|dónde)\b/gi) || []).length;
  
  // Common Portuguese words
  const portuguesePatterns = /\b(o|a|os|as|um|uma|de|que|em|com|por|para|como|mas|este|esta|são|está|tem|faz|onde|quando|porque|qual)\b/i;
  const portugueseScore = (textLower.match(/\b(o|a|os|as|um|uma|de|que|em|com|por|para|como|mas|este|esta|são|está|tem|faz|onde|quando|porque|qual)\b/gi) || []).length;
  
  // Common French words
  const frenchPatterns = /\b(le|la|les|un|une|de|du|des|que|qui|est|en|avec|pour|comme|mais|ce|cette|sont|à|tous|vous|nous|je)\b/i;
  const frenchScore = (textLower.match(/\b(le|la|les|un|une|de|du|des|que|qui|est|en|avec|pour|comme|mais|ce|cette|sont|à|tous|vous|nous|je)\b/gi) || []).length;
  
  // Common English words
  const englishPatterns = /\b(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|need|dare|ought|used|to|of|in|for|on|with|at|by|from|as|into|through|during|before|after|above|below|between|under|again|further|then|once|here|there|when|where|why|how|all|each|every|both|few|more|most|other|some|such|no|nor|not|only|own|same|so|than|too|very|just|can|will|don|should|now)\b/i;
  const englishScore = (textLower.match(/\b(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|need|dare|ought|used|to|of|in|for|on|with|at|by|from|as|into|through|during|before|after|above|below|between|under|again|further|then|once|here|there|when|where|why|how|all|each|every|both|few|more|most|other|some|such|no|nor|not|only|own|same|so|than|too|very|just|can|will|don|should|now)\b/gi) || []).length;
  
  // Find the highest score
  const scores = {
    en: englishScore,
    es: spanishScore,
    pt: portugueseScore,
    fr: frenchScore,
  };
  
  const maxScore = Math.max(...Object.values(scores));
  
  if (maxScore > 0) {
    const detected = Object.entries(scores).find(([_, score]) => score === maxScore);
    if (detected && maxScore >= 2) {
      return detected[0] as SupportedLanguage;
    }
  }
  
  // Default to Spanish if no clear detection
  return 'es';
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
  const quickResult = detectLanguageQuick(text);
  
  if (!useAI) {
    return {
      language: quickResult,
      confidence: 0.7,
    };
  }
  
  // Then verify with AI for higher accuracy
  try {
    const aiResult = await detectLanguageWithLongCat(text, config);
    return aiResult;
  } catch (error) {
    // Fallback to quick detection if AI fails
    console.warn('[detectLanguage] AI detection failed, using heuristic fallback');
    return {
      language: quickResult,
      confidence: 0.7,
    };
  }
}

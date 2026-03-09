/**
 * AI Plugin Constants
 * Centralized configuration for AI-related features including message quality filtering.
 */

/**
 * Quality filter configuration
 */
export const QUALITY_FILTER_CONFIG = {
  minScore: 30,
  minLength: 3,
  maxLength: 500,
  maxRepetitionRatio: 0.6,
  enableAIEvaluation: false,
} as const;

/**
 * Low quality patterns for detection
 */
export const LOW_QUALITY_PATTERNS = {
  chessBoard: /^[a-h][1-8]([\s,/-][a-h][1-8])+$/im,
  spacedLetters: /^[a-zA-Z]([\s,]+[a-zA-Z])+$/,
  numberedPattern: /^(\d+[\s,.-]+\d+[\s,.-]+)+$/,
  repeatedChars: /(.)\1{4,}/,
  repeatedSyllables: /\b(\w{2,})\1{2,}\b/i,
  gibberish: /^[^aeiou]{4,}[^aeiou]*$/i,
  onlyNumbersSymbols: /^[0-9\s,.-]+$/,
  excessivePunctuation: /[!?.]{5,}/,
} as const;

/**
 * Short words that are meaningful despite being short
 */
export const MEANINGFUL_SHORT_WORDS = [
  'ok',
  'yes',
  'no',
  'hi',
  'hey',
  'yo',
  'lol',
  'omg',
  'wow',
  'yes',
  'nah',
  'sup',
  'yep',
  'nope',
  'gtg',
  'brb',
  'tbh',
  'imo',
  'idk',
  'btw',
  'ty',
  'thx',
  'pls',
  'plz',
  'thanks',
  'thank',
  'sorry',
  'please',
  'hello',
  'good',
  'bad',
  'nice',
  'cool',
  'wow',
  'damn',
  'shit',
  'fuck',
  'hell',
  'yeah',
  'yay',
  'nay',
  'boo',
  'meh',
  'aha',
  'ohh',
  'uhm',
  'umm',
  'hmm',
  'hm',
  'ah',
  'eh',
  'uh',
  'um',
  'oi',
  'yo',
  'hi',
  'hey',
  'bye',
  'cya',
  'gn',
  'gm',
  'nm',
  'np',
  'wc',
  'welcome',
  'de nada',
  'por favor',
  'gracias',
  'bonjour',
  'merci',
  ' oui',
  'non',
  'ja',
  'nein',
  'si',
  'arr',
] as const;

/**
 * Quality penalties for different issues
 */
export const QUALITY_PENALTIES = {
  tooShort: 50,
  veryShort: 25,
  visualPatterns: 40,
  spacedLetters: 45,
  numberedPattern: 30,
  excessiveRepetition: 35,
  gibberish: 50,
  highRepetition: 30,
  moderateRepetition: 15,
  onlyNumbersSymbols: 40,
  excessivePunctuation: 20,
  meaningfulWordBonus: 10,
} as const;

/**
 * Prefixes that indicate the message should be skipped
 */
export const SKIP_PREFIXES = [
  '!',
  '/',
  '.',
  '-',
  '+',
  '*',
  '#',
  '@',
  '$',
  '%',
  '^',
  '&',
  '(',
  '[',
  '{',
  '<',
  '>',
  '|',
  '\\',
  '~',
  '`',
  '"',
  "'",
  ':',
  ';',
  '>',
  '?',
  ',',
] as const;

/**
 * LongCat API Configuration
 */
export const LONGCAT_CONFIG = {
  apiKey: process.env.api_key || '',
  baseURL: process.env.api_base || 'https://api.longcat.chat/openai',
  defaultModel: process.env.model || 'LongCat-Flash-Chat',
  timeout: 30000,
  maxRetries: 3,
} as const;

/**
 * Supported languages for TTS
 */
export const SUPPORTED_TTS_LANGUAGES = ['en', 'ko', 'es', 'pt', 'fr'] as const;

/**
 * Default TTS voice settings
 */
export const TTS_DEFAULTS = {
  voice: 'F1',
  speed: 1.0,
  outputDir: './output',
} as const;

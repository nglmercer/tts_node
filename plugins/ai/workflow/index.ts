/**
 * Real-time Comment Response Workflow
 * 
 * A production-ready, environment-agnostic workflow module that:
 * - Receives messages via submit() method or listener pattern
 * - Processes comments in configurable groups (turn-based)
 * - Filters which comments to respond based on priority/type
 * - Emits responses via callback
 * - Uses LongCat AI by default for analysis and responses
 * - Supports semantic memory for context-aware responses
 * 
 * @example
 * ```ts
 * import { createCommentResponder } from 'ai-sdk-tools/workflows';
 * 
 * const responder = createCommentResponder({
 *   onResponse: (response) => {
 *     console.log(`Reply to ${response.originalMessage.author}: ${response.response}`);
 *   },
 *   minPriorityToRespond: 3,
 *   batchSize: 5,
 *   enableMemory: true
 * });
 * 
 * // Submit messages
 * await responder.submit({
 *   id: '1',
 *   author: 'User',
 *   content: 'Hello, I need help!'
 * });
 * ```
 */

import { createLongCat } from '../providers/longcat';
import { envConfig } from '../utils/env-loader';
import { generateText } from 'ai';
import { SemanticMemory, createInitializedSemanticMemory, type MemorySearchResult } from '../tools/semantic-memory';

// ============================================
// Public Types
// ============================================

/**
 * Incoming message structure
 */
export interface CommentMessage {
  /** Unique identifier for the message */
  id: string;
  /** Author/sender of the message */
  author: string;
  /** Message content */
  content: string;
  /** Optional timestamp */
  timestamp?: number;
  /** Optional metadata for custom use */
  metadata?: Record<string, unknown>;
}

/**
 * Analysis result for a message
 */
export interface CommentAnalysis {
  /** Detected type of comment */
  type: 'greeting' | 'question' | 'request' | 'statement' | 'complaint' | 'feedback';
  /** Priority level (1=lowest, 5=highest/urgent) */
  priority: number;
  /** Detected language code (e.g., 'en', 'es', 'pt') */
  language: string;
  /** Confidence score of the analysis (0-1) */
  confidence: number;
  /** Optional sentiment */
  sentiment?: 'positive' | 'negative' | 'neutral';
}

/**
 * Decision made for a message
 */
export interface CommentDecision {
  /** The decision type */
  decision: 'respond_now' | 'batch' | 'wait' | 'ignore';
  /** Human-readable reason for the decision */
  reason: string;
  /** Confidence in this decision (0-1) */
  confidence: number;
}

/**
 * Response output structure
 */
export interface CommentResponse {
  /** Unique response ID */
  id: string;
  /** The original message being responded to */
  originalMessage: CommentMessage;
  /** The generated response text */
  response: string;
  /** Language of the response */
  language: string;
  /** Analysis of the original message */
  analysis: CommentAnalysis;
  /** Decision that led to this response */
  decision: CommentDecision;
  /** Timestamp when response was generated */
  timestamp: number;
}

/**
 * Configuration for the CommentResponder
 */
export interface CommentResponderConfig {
  // ===== Processing Configuration =====
  
  /** Number of messages to process per batch (default: 5) */
  batchSize?: number;
  
  /** Max wait time in ms before processing a batch (default: 5000) */
  batchTimeout?: number;
  
  /** Max pending messages before forced processing (default: 10) */
  maxPendingSize?: number;

  // ===== Response Filtering =====
  
  /** Minimum priority to respond (1-5, default: 3) */
  minPriorityToRespond?: number;
  
  /** Only respond to these types (optional) */
  respondToTypes?: Array<CommentAnalysis['type']>;
  
  /** Ignore these types (optional) */
  ignoreTypes?: Array<CommentAnalysis['type']>;

  // ===== LongCat Configuration =====
  
  /** LongCat API key (falls back to env.LONGCAT_API_KEY) */
  apiKey?: string;
  
  /** LongCat model to use (default: from env or 'LongCat-Flash-Chat') */
  model?: string;
  
  /** LongCat API base URL (default: from env or 'https://api.longcat.chat/openai') */
  apiBase?: string;

  // ===== Semantic Memory Configuration =====
  
  /** Enable semantic memory for context-aware responses (default: false) */
  enableMemory?: boolean;
  
  /** Maximum memory entries to store (default: 1000) */
  memoryMaxEntries?: number;
  
  /** Minimum similarity threshold for memory search (default: 0.5) */
  memorySimilarityThreshold?: number;
  
  /** Maximum context results from memory (default: 3) */
  memoryMaxContextResults?: number;

  // ===== Callbacks =====
  
  /** Called when a response is ready */
  onResponse?: (response: CommentResponse) => void | Promise<void>;
  
  /** Called after message analysis */
  onAnalysis?: (message: CommentMessage, analysis: CommentAnalysis) => void | Promise<void>;
  
  /** Called after decision is made */
  onDecision?: (message: CommentMessage, decision: CommentDecision) => void | Promise<void>;
  
  /** Called when a batch starts processing */
  onBatchStart?: (messages: CommentMessage[]) => void | Promise<void>;
  
  /** Called when a batch finishes processing */
  onBatchEnd?: (responses: CommentResponse[]) => void | Promise<void>;
  
  /** Called on errors */
  onError?: (error: Error, context?: string) => void | Promise<void>;
}

/**
 * Message listener function type
 */
export type CommentMessageListener = (message: CommentMessage) => void | Promise<void>;

/**
 * Response callback function type
 */
export type CommentResponseCallback = (response: CommentResponse) => void | Promise<void>;

// ============================================
// Internal Types
// ============================================

interface PendingItem {
  message: CommentMessage;
  analysis: CommentAnalysis;
  decision: CommentDecision;
}

interface LongCatClient {
  model: (model: string) => unknown;
  defaultModel: string;
}

// ============================================
// LongCat Integration
// ============================================

function createLongCatClient(config: CommentResponderConfig): LongCatClient | null {
  const apiKey = config.apiKey || envConfig.api_key;
  if (!apiKey) return null;

  return createLongCat({
    apiKey,
    baseURL: config.apiBase || envConfig.api_base,
    model: config.model || envConfig.model
  });
}
async function analyzeAndDecide(
  message: CommentMessage,
  config: CommentResponderConfig,
  client: LongCatClient | null
): Promise<{ analysis: CommentAnalysis; decision: CommentDecision }> {
  if (!client) {
    const analysis = fallbackAnalysis(message);
    const decision = makeDecision(message, analysis, config);
    return { analysis, decision };
  }

  // Single efficient AI call - model decides if it should respond
  const systemPrompt = `Analyze the message. Output ONLY one of these JSON formats:

To respond: {"r":1,"t":"type","l":"lang"}
To NOT respond: {"r":0}

"r" = respond (1=yes, 0=no)
"t" = type: greeting|question|request|statement|complaint|feedback
"l" = language code (en, es, pt, etc.)

Respond 0 (no) when:
- User explicitly says not to respond ("no respondas", "don't reply", etc.)
- Message is a statement that doesn't need a reply
- Content is casual/low priority

Respond 1 (yes) when:
- Direct question or request for help
- Greeting that expects a response
- High priority/urgent content`;

  try {
    const result = await generateText({
      model: client.model(client.defaultModel) as Parameters<typeof generateText>[0]['model'],
      system: systemPrompt,
      prompt: message.content,
      temperature: 0.2,
    });

    const jsonMatch = result.text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const shouldRespond = parsed.r === 1;
      
      const analysis: CommentAnalysis = {
        type: parsed.t || 'statement',
        priority: shouldRespond ? 3 : 1,
        language: parsed.l || 'en',
        sentiment: 'neutral',
        confidence: 0.9
      };

      const decision: CommentDecision = shouldRespond 
        ? {
            decision: 'respond_now',
            reason: 'Model decided to respond',
            confidence: 0.9
          }
        : {
            decision: 'ignore',
            reason: 'Model decided not to respond',
            confidence: 0.9
          };

      return { analysis, decision };
    }
  } catch (error) {
    // Fall through to fallback
  }

  const analysis = fallbackAnalysis(message);
  const decision = makeDecision(message, analysis, config);
  return { analysis, decision };
}

async function analyzeMessage(
  message: CommentMessage,
  client: LongCatClient | null
): Promise<CommentAnalysis> {
  if (!client) {
    return fallbackAnalysis(message);
  }

  const systemPrompt = `Analyze this message and respond with ONLY a JSON object on a single line:
{"type":"greeting|question|request|statement|complaint|feedback","priority":1-5,"language":"code","sentiment":"positive|negative|neutral"}

Type rules:
- greeting: Hello, hi, good morning, greetings
- question: Asks something, ends with ?
- request: Asks for help, action, or assistance  
- statement: General statements, feedback, comments
- complaint: Negative feedback, problems, issues
- feedback: Constructive feedback, suggestions

Priority rules:
- 5: Urgent, critical, ASAP, emergency
- 4: High priority, important, needs attention
- 3: Normal priority
- 2: Low priority, casual
- 1: Very low, can wait`;

  try {
    const result = await generateText({
      model: client.model(client.defaultModel) as Parameters<typeof generateText>[0]['model'],
      system: systemPrompt,
      prompt: message.content,
      temperature: 0.3,
    });

    const jsonMatch = result.text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        type: parsed.type || 'statement',
        priority: Math.min(5, Math.max(1, parsed.priority || 3)),
        language: parsed.language || 'en',
        sentiment: parsed.sentiment || 'neutral',
        confidence: 0.9
      };
    }
  } catch (error) {
    // Fall through to fallback
  }

  return fallbackAnalysis(message);
}

function fallbackAnalysis(message: CommentMessage): CommentAnalysis {
  const content = message.content.toLowerCase();
  let type: CommentAnalysis['type'] = 'statement';
  let priority = 3;

  // Type detection
  if (/^(hello|hi|hey|good\s*(morning|afternoon|evening)|greetings)/i.test(content)) {
    type = 'greeting';
    priority = 2;
  } else if (content.includes('?')) {
    type = 'question';
    priority = 3;
  } else if (/\b(help|please|can you|could you|would you|need|want)\b/i.test(content)) {
    type = 'request';
    priority = 4;
  } else if (/\b(bug|problem|issue|error|broken|not working|complaint)\b/i.test(content)) {
    type = 'complaint';
    priority = 4;
  } else if (/\b(feedback|suggestion|improve|better)\b/i.test(content)) {
    type = 'feedback';
    priority = 3;
  }

  // Priority adjustments
  if (/\b(urgent|asap|critical|emergency|immediately)\b/i.test(content)) {
    priority = 5;
  } else if (/\b(thanks|thank you|great|awesome|nice|good)\b/i.test(content)) {
    priority = Math.max(1, priority - 1);
  }

  return {
    type,
    priority,
    language: 'en',
    sentiment: 'neutral',
    confidence: 0.6
  };
}

function makeDecision(
  message: CommentMessage,
  analysis: CommentAnalysis,
  config: CommentResponderConfig
): CommentDecision {
  const minPriority = config.minPriorityToRespond ?? 3;
  const respondToTypes = config.respondToTypes;
  const ignoreTypes = config.ignoreTypes ?? [];

  // Check ignore list
  if (ignoreTypes.includes(analysis.type)) {
    return {
      decision: 'ignore',
      reason: `Type '${analysis.type}' is in ignore list`,
      confidence: 1.0
    };
  }

  // Check respond list
  if (respondToTypes && !respondToTypes.includes(analysis.type)) {
    return {
      decision: 'wait',
      reason: `Type '${analysis.type}' is not in respond list`,
      confidence: 0.8
    };
  }

  // Check priority threshold
  if (analysis.priority < minPriority) {
    return {
      decision: 'wait',
      reason: `Priority ${analysis.priority} below threshold ${minPriority}`,
      confidence: 0.8
    };
  }

  // High priority = immediate response
  if (analysis.priority >= 4) {
    return {
      decision: 'respond_now',
      reason: `High priority (${analysis.priority}/5) ${analysis.type}`,
      confidence: 0.9
    };
  }

  // Normal priority = batch
  return {
    decision: 'batch',
    reason: `Normal priority ${analysis.type} for batching`,
    confidence: 0.8
  };
}

async function generateResponse(
  message: CommentMessage,
  analysis: CommentAnalysis,
  client: LongCatClient | null,
  memory: SemanticMemory | null = null,
  maxContextResults: number = 3
): Promise<{ response: string; language: string }> {
  if (!client) {
    return {
      response: `I understand your ${analysis.type}. How can I help you with that?`,
      language: analysis.language
    };
  }

  // Get relevant context from memory if available
  let memoryContext = '';
  if (memory && memory.ready) {
    try {
      const relevantMemories = await memory.findRelevant(message.content, {
        maxResults: maxContextResults,
      });
      
      if (relevantMemories.length > 0) {
        const contextLines = relevantMemories.map(m => 
          `[${m.entry.role}]: ${m.entry.content}`
        );
        memoryContext = `\n\nRelevant past conversation:\n${contextLines.join('\n')}`;
      }
    } catch (error) {
      // Ignore memory errors, continue without context
    }
  }

  const systemPrompt = `You are a helpful, friendly assistant. Respond concisely and naturally.
Your response will be spoken via text-to-speech, so:
- Keep it conversational and natural
- Avoid bullet points or special formatting
- Stay under 100 words
- Respond in the same language as the user${memoryContext}`;

  try {
    const result = await generateText({
      model: client.model(client.defaultModel) as Parameters<typeof generateText>[0]['model'],
      system: systemPrompt,
      prompt: message.content,
      temperature: 0.7,
    });

    return {
      response: result.text.trim(),
      language: analysis.language
    };
  } catch (error) {
    return {
      response: `I received your ${analysis.type}. Let me help you with that.`,
      language: analysis.language
    };
  }
}

// ============================================
// CommentResponder Class
// ============================================

/**
 * Production-ready comment response workflow.
 * 
 * Receives messages, analyzes them with AI, decides whether/how to respond,
 * and emits responses via callbacks.
 */
export class CommentResponder {
  private config: CommentResponderConfig;
  private client: LongCatClient | null = null;
  private pending: PendingItem[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private isProcessing = false;
  private listeners: Set<CommentMessageListener> = new Set();
  private memory: SemanticMemory | null = null;
  private memoryInitPromise: Promise<void> | null = null;

  constructor(config: CommentResponderConfig = {}) {
    this.config = {
      batchSize: 5,
      batchTimeout: 5000,
      maxPendingSize: 10,
      minPriorityToRespond: 3,
      enableMemory: false,
      memoryMaxEntries: 1000,
      memorySimilarityThreshold: 0.5,
      memoryMaxContextResults: 3,
      ...config
    };

    this.client = createLongCatClient(this.config);
    
    // Initialize memory if enabled
    if (this.config.enableMemory) {
      this.memoryInitPromise = this.initializeMemory();
    }
  }

  /**
   * Initialize semantic memory asynchronously
   */
  private async initializeMemory(): Promise<void> {
    try {
      this.memory = await createInitializedSemanticMemory({
        maxEntries: this.config.memoryMaxEntries,
        similarityThreshold: this.config.memorySimilarityThreshold,
      });
    } catch (error) {
      console.warn('Failed to initialize semantic memory:', error);
      this.memory = null;
    }
  }

  /**
   * Wait for memory to be ready
   */
  async waitForMemory(): Promise<boolean> {
    if (this.memoryInitPromise) {
      await this.memoryInitPromise;
    }
    return this.memory?.ready ?? false;
  }

  /**
   * Get memory instance (for advanced usage)
   */
  getMemory(): SemanticMemory | null {
    return this.memory;
  }

  /**
   * Submit a message for processing
   */
  async submit(message: CommentMessage): Promise<void> {
    // Wait for memory to be ready if enabled
    if (this.memoryInitPromise) {
      await this.memoryInitPromise;
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        await listener(message);
      } catch {
        // Ignore listener errors
      }
    }

    // Store user message in memory
    if (this.memory) {
      await this.memory.add('user', message.content, {
        messageId: message.id,
        author: message.author,
        timestamp: message.timestamp,
      });
    }

    // Combined analysis and decision in a single AI call (more efficient)
    const { analysis, decision } = await analyzeAndDecide(message, this.config, this.client);
    
    if (this.config.onAnalysis) {
      await this.config.onAnalysis(message, analysis);
    }
    
    if (this.config.onDecision) {
      await this.config.onDecision(message, decision);
    }

    // Handle decision
    switch (decision.decision) {
      case 'respond_now':
        await this.processImmediate(message, analysis, decision);
        break;
      case 'ignore':
        break;
      case 'wait':
      case 'batch':
        this.addToBatch(message, analysis, decision);
        break;
    }
  }

  /**
   * Submit multiple messages
   */
  async submitBatch(messages: CommentMessage[]): Promise<void> {
    for (const message of messages) {
      await this.submit(message);
    }
  }

  /**
   * Add a message listener
   * @returns Unsubscribe function
   */
  onMessage(listener: CommentMessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Force process all pending messages
   */
  async flush(): Promise<void> {
    while (this.pending.length > 0) {
      await this.processBatch();
    }
  }

  /**
   * Get pending message count
   */
  getPendingCount(): number {
    return this.pending.length;
  }

  /**
   * Clear all pending messages
   */
  clear(): void {
    this.pending = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CommentResponderConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Recreate client if API config changed
    if (config.apiKey || config.apiBase || config.model) {
      this.client = createLongCatClient(this.config);
    }
  }

  // ===== Private Methods =====

  private async processImmediate(
    message: CommentMessage,
    analysis: CommentAnalysis,
    decision: CommentDecision
  ): Promise<void> {
    try {
      const { response, language } = await generateResponse(
        message, 
        analysis, 
        this.client, 
        this.memory,
        this.config.memoryMaxContextResults
      );

      // Store assistant response in memory
      if (this.memory) {
        await this.memory.add('assistant', response, {
          messageId: message.id,
          originalMessage: message.content,
        });
      }

      const output: CommentResponse = {
        id: `resp_${message.id}_${Date.now()}`,
        originalMessage: message,
        response,
        language,
        analysis,
        decision,
        timestamp: Date.now()
      };

      if (this.config.onResponse) {
        await this.config.onResponse(output);
      }
    } catch (error) {
      if (this.config.onError) {
        await this.config.onError(error as Error, 'immediate_response');
      }
    }
  }

  private addToBatch(
    message: CommentMessage,
    analysis: CommentAnalysis,
    decision: CommentDecision
  ): void {
    this.pending.push({ message, analysis, decision });

    const shouldProcess = 
      this.pending.length >= (this.config.maxPendingSize ?? 10) ||
      this.pending.length >= (this.config.batchSize ?? 5);

    if (shouldProcess) {
      this.processBatch();
    } else {
      this.scheduleBatch();
    }
  }

  private scheduleBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, this.config.batchTimeout);
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.pending.length === 0) {
      return;
    }

    this.isProcessing = true;

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const batch = this.pending.splice(0, this.config.batchSize ?? 5);

    if (this.config.onBatchStart) {
      await this.config.onBatchStart(batch.map(b => b.message));
    }

    const responses: CommentResponse[] = [];

    for (const { message, analysis, decision } of batch) {
      try {
        const { response, language } = await generateResponse(
          message, 
          analysis, 
          this.client,
          this.memory,
          this.config.memoryMaxContextResults
        );

        // Store assistant response in memory
        if (this.memory) {
          await this.memory.add('assistant', response, {
            messageId: message.id,
            originalMessage: message.content,
          });
        }

        const output: CommentResponse = {
          id: `resp_${message.id}_${Date.now()}`,
          originalMessage: message,
          response,
          language,
          analysis,
          decision,
          timestamp: Date.now()
        };

        responses.push(output);

        if (this.config.onResponse) {
          await this.config.onResponse(output);
        }
      } catch (error) {
        if (this.config.onError) {
          await this.config.onError(error as Error, 'batch_processing');
        }
      }
    }

    if (this.config.onBatchEnd) {
      await this.config.onBatchEnd(responses);
    }

    this.isProcessing = false;

    if (this.pending.length > 0) {
      this.scheduleBatch();
    }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new CommentResponder instance
 */
export function createCommentResponder(config?: CommentResponderConfig): CommentResponder {
  return new CommentResponder(config);
}

/**
 * Create a simple responder with just a response callback
 */
export function createSimpleResponder(
  onResponse: CommentResponseCallback,
  options?: Omit<CommentResponderConfig, 'onResponse'>
): CommentResponder {
  return new CommentResponder({
    ...options,
    onResponse
  });
}

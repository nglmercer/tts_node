/**
 * Semantic Memory Module
 * 
 * Uses @huggingface/transformers embeddings to provide semantic memory
 * for better context awareness in conversations.
 * 
 * @example
 * ```ts
 * import { SemanticMemory } from 'ai-sdk-tools/tools';
 * 
 * const memory = new SemanticMemory();
 * await memory.initialize();
 * 
 * // Store conversations
 * memory.add('user', 'Hello, how are you?');
 * memory.add('assistant', 'I am doing great!');
 * 
 * // Find similar context
 * const context = await memory.findRelevant('How are you doing?');
 * console.log(context); // Returns similar past conversations
 * ```
 */

import { pipeline, cos_sim } from '@huggingface/transformers';
import type { Tensor } from '@huggingface/transformers';

// ============================================
// Types
// ============================================

export interface MemoryEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  embedding?: number[];
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  similarity: number;
}

export interface SemanticMemoryConfig {
  /** Model to use for embeddings (default: 'mixedbread-ai/mxbai-embed-large-v1') */
  model?: string;
  /** Data type for embeddings (default: 'fp32') */
  dtype?: 'fp32' | 'fp16' | 'q8';
  /** Maximum entries to store (default: 1000) */
  maxEntries?: number;
  /** Minimum similarity threshold for search results (default: 0.5) */
  similarityThreshold?: number;
  /** Maximum results to return from search (default: 5) */
  maxSearchResults?: number;
  /** Whether to store embeddings (default: true) */
  storeEmbeddings?: boolean;
}

// Pipeline type from @huggingface/transformers
type FeatureExtractionPipeline = (inputs: string | string[], options?: { pooling?: string }) => Promise<Tensor>;

// ============================================
// SemanticMemory Class
// ============================================

/**
 * Semantic memory system using transformer embeddings for context-aware
 * conversation management.
 */
export class SemanticMemory {
  private config: Required<SemanticMemoryConfig>;
  private extractor: FeatureExtractionPipeline | null = null;
  private entries: MemoryEntry[] = [];
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: SemanticMemoryConfig = {}) {
    this.config = {
      model: config.model || 'mixedbread-ai/mxbai-embed-large-v1',
      dtype: config.dtype || 'q8',
      maxEntries: config.maxEntries ?? 1000,
      similarityThreshold: config.similarityThreshold ?? 0.5,
      maxSearchResults: config.maxSearchResults ?? 5,
      storeEmbeddings: config.storeEmbeddings ?? true,
    };
  }

  /**
   * Initialize the embedding model
   * Must be called before using findRelevant or add with embeddings
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      this.extractor = await pipeline('feature-extraction', this.config.model, {
        dtype: this.config.dtype,
      }) as unknown as FeatureExtractionPipeline;
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize semantic memory:', error);
      throw error;
    }
  }

  /**
   * Check if the memory system is ready
   */
  get ready(): boolean {
    return this.isInitialized;
  }

  /**
   * Generate embedding for a text
   */
  private async getEmbedding(text: string): Promise<number[]> {
    if (!this.extractor) {
      throw new Error('SemanticMemory not initialized. Call initialize() first.');
    }
    
    const output = await this.extractor(text, { pooling: 'cls' });
    // Tensor.tolist() returns nested arrays
    return (output.tolist() as number[][])[0] || [];
  }

  /**
   * Generate embeddings for multiple texts
   */
  private async getEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.extractor) {
      throw new Error('SemanticMemory not initialized. Call initialize() first.');
    }
    
    const output = await this.extractor(texts, { pooling: 'cls' });
    return output.tolist() as number[][];
  }

  /**
   * Add a memory entry
   */
  async add(
    role: MemoryEntry['role'],
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: Date.now(),
      metadata,
    };

    if (this.config.storeEmbeddings && this.isInitialized) {
      try {
        entry.embedding = await this.getEmbedding(content);
      } catch (error) {
        console.warn('Failed to generate embedding for entry:', error);
      }
    }

    this.entries.push(entry);

    // Enforce max entries limit
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    return entry;
  }

  /**
   * Add multiple entries at once (more efficient for batch operations)
   */
  async addBatch(
    items: Array<{ role: MemoryEntry['role']; content: string; metadata?: Record<string, unknown> }>
  ): Promise<MemoryEntry[]> {
    const entries: MemoryEntry[] = [];

    if (this.config.storeEmbeddings && this.isInitialized && items.length > 0) {
      try {
        const contents = items.map(item => item.content);
        const embeddings = await this.getEmbeddings(contents);

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          entries.push({
            id: `mem_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
            role: item!.role,
            content: item!.content,
            embedding: embeddings[i],
            timestamp: Date.now(),
            metadata: item!.metadata,
          });
        }
      } catch (error) {
        console.warn('Failed to generate batch embeddings:', error);
        // Fall back to adding without embeddings
        for (const item of items) {
          entries.push({
            id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            role: item.role,
            content: item.content,
            timestamp: Date.now(),
            metadata: item.metadata,
          });
        }
      }
    } else {
      for (const item of items) {
        entries.push({
          id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          role: item.role,
          content: item.content,
          timestamp: Date.now(),
          metadata: item.metadata,
        });
      }
    }

    this.entries.push(...entries);

    // Enforce max entries limit
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    return entries;
  }

  /**
   * Find relevant memories based on semantic similarity
   */
  async findRelevant(
    query: string,
    options?: {
      maxResults?: number;
      threshold?: number;
      roles?: MemoryEntry['role'][];
    }
  ): Promise<MemorySearchResult[]> {
    if (!this.isInitialized || this.entries.length === 0) {
      return [];
    }

    const maxResults = options?.maxResults ?? this.config.maxSearchResults;
    const threshold = options?.threshold ?? this.config.similarityThreshold;
    const roles = options?.roles;

    try {
      const queryEmbedding = await this.getEmbedding(query);

      // Filter entries with embeddings and optionally by role
      const searchableEntries = this.entries.filter(
        entry => entry.embedding && (!roles || roles.includes(entry.role))
      );

      // Calculate similarities
      const results: MemorySearchResult[] = searchableEntries
        .map(entry => ({
          entry,
          similarity: cos_sim(queryEmbedding, entry.embedding!),
        }))
        .filter(result => result.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxResults);

      return results;
    } catch (error) {
      console.error('Failed to find relevant memories:', error);
      return [];
    }
  }

  /**
   * Get conversation context for a query
   * Returns formatted context string with relevant past conversations
   */
  async getContext(
    query: string,
    options?: {
      maxResults?: number;
      threshold?: number;
      format?: 'plain' | 'markdown';
    }
  ): Promise<string> {
    const results = await this.findRelevant(query, options);
    
    if (results.length === 0) {
      return '';
    }

    const format = options?.format ?? 'plain';
    
    if (format === 'markdown') {
      const lines = results.map(r => {
        const role = r.entry.role.charAt(0).toUpperCase() + r.entry.role.slice(1);
        return `**${role}**: ${r.entry.content} (similarity: ${r.similarity.toFixed(2)})`;
      });
      return '### Relevant Context\n\n' + lines.join('\n\n');
    }

    const lines = results.map(r => {
      const role = r.entry.role.charAt(0).toUpperCase() + r.entry.role.slice(1);
      return `[${role}]: ${r.entry.content}`;
    });
    return 'Relevant context:\n' + lines.join('\n');
  }

  /**
   * Get all entries
   */
  getAll(): MemoryEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries by role
   */
  getByRole(role: MemoryEntry['role']): MemoryEntry[] {
    return this.entries.filter(entry => entry.role === role);
  }

  /**
   * Get recent entries
   */
  getRecent(count: number = 10): MemoryEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Get entry count
   */
  get count(): number {
    return this.entries.length;
  }

  /**
   * Clear all memories
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Export memories to JSON
   */
  export(): string {
    return JSON.stringify({
      config: this.config,
      entries: this.entries,
    });
  }

  /**
   * Import memories from JSON
   */
  import(json: string): void {
    try {
      const data = JSON.parse(json);
      if (data.entries && Array.isArray(data.entries)) {
        this.entries = data.entries;
      }
    } catch (error) {
      console.error('Failed to import memories:', error);
    }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new SemanticMemory instance
 */
export function createSemanticMemory(config?: SemanticMemoryConfig): SemanticMemory {
  return new SemanticMemory(config);
}

/**
 * Create and initialize a SemanticMemory instance in one call
 */
export async function createInitializedSemanticMemory(
  config?: SemanticMemoryConfig
): Promise<SemanticMemory> {
  const memory = new SemanticMemory(config);
  await memory.initialize();
  return memory;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate cosine similarity between two texts using embeddings
 */
export async function calculateTextSimilarity(
  text1: string,
  text2: string,
  model: string = 'mixedbread-ai/mxbai-embed-large-v1'
): Promise<number> {
  const extractor = await pipeline('feature-extraction', model, { dtype: 'fp32' }) as unknown as FeatureExtractionPipeline;
  const output = await extractor([text1, text2], { pooling: 'cls' });
  const embeddings = output.tolist() as number[][];
  return cos_sim(embeddings[0]!, embeddings[1]!);
}

/**
 * Find the most similar text from a list
 */
export async function findMostSimilar(
  query: string,
  candidates: string[],
  model: string = 'mixedbread-ai/mxbai-embed-large-v1'
): Promise<{ text: string; similarity: number; index: number }> {
  const extractor = await pipeline('feature-extraction', model, { dtype: 'fp32' }) as unknown as FeatureExtractionPipeline;
  
  const allTexts = [query, ...candidates];
  const output = await extractor(allTexts, { pooling: 'cls' });
  const embeddings = output.tolist() as number[][];
  
  const queryEmbedding = embeddings[0];
  let bestSimilarity = -1;
  let bestIndex = 0;

  for (let i = 1; i < embeddings.length; i++) {
    const similarity = cos_sim(queryEmbedding!, embeddings[i]!);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestIndex = i - 1;
    }
  }

  return {
    text: candidates[bestIndex]!,
    similarity: bestSimilarity,
    index: bestIndex,
  };
}

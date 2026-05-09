import { Database } from '../db/database'
import crypto from 'crypto'

export interface AIMemory {
  id: string
  username: string
  platform: string
  content: string
  embedding: number[]
  timestamp: string
}

export class MemoryService {
  constructor(private db: Database) {
    this.initTable()
  }

  private initTable() {
    this.db.getRawDb().exec(`
      CREATE TABLE IF NOT EXISTS ai_memories (
        id TEXT PRIMARY KEY,
        username TEXT,
        platform TEXT,
        content TEXT,
        embedding BLOB,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  async addMemory(
    username: string,
    platform: string,
    content: string,
    embedding: number[]
  ): Promise<void> {
    const id = crypto.randomUUID()
    const stmt = this.db.getRawDb().prepare(`
      INSERT INTO ai_memories (id, username, platform, content, embedding)
      VALUES (?, ?, ?, ?, ?)
    `)
    stmt.run(id, username, platform, content, Buffer.from(JSON.stringify(embedding)))
  }

  async getRelevantMemories(
    username: string,
    platform: string,
    queryEmbedding: number[],
    limit: number = 3
  ): Promise<string[]> {
    // Linear scan with Cosine Similarity in JS (Efficient enough for local use)
    const memories = this.db.getRawDb().prepare(`
      SELECT content, embedding FROM ai_memories
      WHERE username = ? AND platform = ?
    `).all(username, platform) as { content: string; embedding: Buffer }[]

    if (memories.length === 0) return []

    const scored = memories.map(m => {
      const vec = JSON.parse(m.embedding.toString())
      return {
        content: m.content,
        score: this.cosineSimilarity(queryEmbedding, vec)
      }
    })

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(m => m.content)
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i]
      normA += vecA[i] * vecA[i]
      normB += vecB[i] * vecB[i]
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }
}

import type { Platform } from '../main/platforms/types'

export interface StreamInsightTopChatter {
  username: string
  displayName: string
  platform: Platform
  count: number
}

export interface StreamInsightPlatformBreakdown {
  platform: Platform
  count: number
}

export interface StreamInsightSnapshot {
  generatedAt: string
  windowSeconds: number
  eventCount: number
  chatCount: number
  chatPerMinute: number
  activeViewers: number
  topTerms: string[]
  topChatters: StreamInsightTopChatter[]
  platformBreakdown: StreamInsightPlatformBreakdown[]
  recommendation: string
  trend: 'quiet' | 'steady' | 'busy'
}

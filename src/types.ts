export type UnknownRecord = Record<string, unknown>

export interface Notification {
  title: string
  message: string
  priority?: number
  tags?: string
}

export interface NtfyConfig {
  topic: string
  baseUrl: string
}

export interface OpenCodeEvent extends UnknownRecord {
  type: string
}

import type { UnknownRecord } from "./types.js"

export const MAX_MESSAGE_LENGTH = 240

export function truncateText(text: string, maxLength = MAX_MESSAGE_LENGTH): string {
  const normalized = text.replace(/```[\s\S]*?```/g, "[code]").replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, "[link]").replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null
}

function extractText(value: unknown): string[] {
  if (!isRecord(value)) return []
  if (value.type === "text" && typeof value.text === "string") return [value.text]
  if (Array.isArray(value.parts)) return value.parts.flatMap(extractText)
  if (Array.isArray(value.content)) return value.content.flatMap(extractText)
  return []
}

/** Extracts the latest assistant text without including reasoning or tool output. */
export function latestAssistantText(messages: readonly unknown[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (!isRecord(message)) continue
    const info = isRecord(message.info) ? message.info : message
    if (info.role !== "assistant" && info.type !== "assistant") continue
    const text = extractText(message).join(" ") || (typeof info.text === "string" ? info.text : "")
    const excerpt = truncateText(text)
    if (excerpt) return excerpt
  }
  return undefined
}

export function compactDetails(value: unknown, fallback: string): string {
  if (typeof value === "string") return truncateText(value) || fallback
  if (!isRecord(value)) return fallback
  const candidates = [value.message, value.error, value.reason, value.action, value.title]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return truncateText(candidate)
    if (isRecord(candidate)) {
      for (const nested of [candidate.message, candidate.label, candidate.title, candidate.reason]) {
        if (typeof nested === "string" && nested.trim()) return truncateText(nested)
      }
    }
  }
  return fallback
}

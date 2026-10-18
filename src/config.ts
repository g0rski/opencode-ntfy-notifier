import type { NtfyConfig } from "./types.js"

const TOPIC_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export function readConfig(env: Record<string, string | undefined>): NtfyConfig {
  const topic = env.NTFY_TOPIC?.trim()
  if (!topic) throw new Error("NTFY_TOPIC must be set to an ntfy topic name.")
  if (!TOPIC_PATTERN.test(topic)) {
    throw new Error("NTFY_TOPIC must contain 1-64 letters, numbers, underscores, or hyphens.")
  }

  const baseUrl = (env.NTFY_BASE_URL?.trim() || "https://ntfy.sh").replace(/\/+$/, "")
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new Error("NTFY_BASE_URL must be a valid HTTP or HTTPS URL.")
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("NTFY_BASE_URL must use HTTP or HTTPS.")
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("NTFY_BASE_URL must not contain credentials, a query, or a fragment.")
  }

  return { topic, baseUrl }
}

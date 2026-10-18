import type { NtfyConfig, Notification } from "./types.js"

const REQUEST_TIMEOUT_MS = 5_000
const MAX_ATTEMPTS = 3

export async function sendNotification(
  config: NtfyConfig,
  notification: Notification,
  fetchImpl: typeof fetch = fetch,
  parentSignal?: AbortSignal,
): Promise<void> {
  const url = `${config.baseUrl}/${encodeURIComponent(config.topic)}`
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notification),
        signal: parentSignal ? AbortSignal.any([controller.signal, parentSignal]) : controller.signal,
      })
    } catch (error) {
      clearTimeout(timeout)
      if (attempt === MAX_ATTEMPTS) throw error
      await delay(attempt * 250)
      continue
    } finally {
      clearTimeout(timeout)
    }

    if (response.ok) return
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`ntfy rejected notification with HTTP ${response.status}.`)
    }
    if (attempt === MAX_ATTEMPTS) throw new Error(`ntfy request failed with HTTP ${response.status}.`)
    const retryAfter = Number(response.headers.get("retry-after"))
    await delay(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 2_000) : attempt * 250)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

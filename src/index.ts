import { Plugin } from "@opencode/plugin"
import { readConfig } from "./config.js"
import { eventNotification, eventSessionId } from "./events.js"
import { sendNotification } from "./ntfy.js"
import { latestAssistantText } from "./text.js"
import type { OpenCodeEvent } from "./types.js"

const MAX_PENDING = 100
const ERROR_DEDUPE_MS = 30_000

export default Plugin.define({
  id: "opencode-ntfy-notifier",
  setup(ctx) {
    let config
    try {
      config = readConfig(process.env)
    } catch (error) {
      console.error(`[opencode-ntfy-notifier] ${error instanceof Error ? error.message : "Invalid configuration."}`)
      return
    }

    const controller = new AbortController()
    const recentErrors = new Map<string, number>()
    let pending = 0
    let work = Promise.resolve()

    const handle = async (event: OpenCodeEvent) => {
      if (controller.signal.aborted) return
      let notification = eventNotification(event)
      if (!notification) return
      const sessionID = eventSessionId(event)
      if (event.type === "session.status" && notification.title === "Status changed to idle" && sessionID) {
        const errorAt = recentErrors.get(sessionID)
        if (errorAt && Date.now() - errorAt < ERROR_DEDUPE_MS) return
        try {
          const messages = await ctx.session.context({ sessionID })
          notification.message = latestAssistantText(messages) ?? "The agent stopped processing. Check the session for details."
        } catch {
          notification.message = "The agent stopped processing. Check the session for details."
        }
      }

      if ((event.type === "session.error" || event.type === "session.execution.failed") && sessionID) {
        const now = Date.now()
        const previous = recentErrors.get(sessionID)
        if (previous && now - previous < ERROR_DEDUPE_MS) return
        recentErrors.set(sessionID, now)
        for (const [id, timestamp] of recentErrors) {
          if (now - timestamp > ERROR_DEDUPE_MS) recentErrors.delete(id)
        }
      }

      await sendNotification(config, notification, fetch, controller.signal)
    }

    void (async () => {
      let reconnectDelay = 1_000
      while (!controller.signal.aborted) {
        try {
          for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
            if (controller.signal.aborted) break
            if (pending >= MAX_PENDING) {
              console.error("[opencode-ntfy-notifier] Notification queue is full; dropping an event.")
              continue
            }
            pending++
            work = work.then(() => handle(event as OpenCodeEvent))
              .catch(() => console.error("[opencode-ntfy-notifier] Could not deliver a notification."))
              .finally(() => { pending-- })
          }
          reconnectDelay = 1_000
          if (!controller.signal.aborted) await new Promise((resolve) => setTimeout(resolve, reconnectDelay))
        } catch {
          if (controller.signal.aborted) break
          await new Promise((resolve) => setTimeout(resolve, reconnectDelay))
          reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
        }
      }
    })()

    return () => {
      controller.abort()
    }
  },
})

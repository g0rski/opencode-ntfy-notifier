import type { Notification, OpenCodeEvent, UnknownRecord } from "./types.js"
import { compactDetails } from "./text.js"

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? value as UnknownRecord : {}
}

function payload(event: OpenCodeEvent): UnknownRecord {
  return { ...event, ...record(event.properties), ...record(event.data) }
}

export function eventNotification(event: OpenCodeEvent): Notification | undefined {
  const data = payload(event)
  switch (event.type) {
    case "session.status": {
      const status = record(data.status)
      if (status.type === "idle") return { title: "Status changed to idle", message: "" }
      if (status.type === "retry") {
        const details = compactDetails(status.action ?? status.message, "The provider is retrying the request.")
        if (status.action) return { title: "Session needs attention", message: details, priority: 4, tags: "warning" }
        if (typeof status.attempt === "number" && status.attempt >= 3) {
          return { title: "Session is retrying", message: details, priority: 3 }
        }
      }
      return undefined
    }
    case "permission.asked":
      return {
        title: "Permission required",
        message: compactDetails({ message: data.message, action: data.action }, "The agent is waiting for permission."),
        priority: 4,
        tags: "warning",
      }
    case "form.created": {
      const form = record(data.form)
      const fields = Array.isArray(form.fields) ? form.fields : []
      const firstField = record(fields[0])
      return {
        title: "Your input is required",
        message: compactDetails(firstField.description ?? firstField.title ?? form.title, "The agent is waiting for your answer."),
        priority: 4,
        tags: "question",
      }
    }
    case "session.execution.failed":
    case "session.error":
      return {
        title: event.type === "session.error" ? "Session error" : "Session failed",
        message: compactDetails(data.error ?? data.message, "The session stopped because of an error."),
        priority: 4,
        tags: "warning",
      }
    case "session.compaction.failed":
      return {
        title: "Context compaction failed",
        message: compactDetails(data.error, "The session could not compact its context."),
        priority: 4,
        tags: "warning",
      }
    default:
      return undefined
  }
}

export function eventSessionId(event: OpenCodeEvent): string | undefined {
  const data = payload(event)
  return typeof data.sessionID === "string" ? data.sessionID : undefined
}

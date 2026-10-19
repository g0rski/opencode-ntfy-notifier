import type { Notification, OpenCodeEvent, UnknownRecord } from "./types.js"
import { compactDetails } from "./text.js"

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? value as UnknownRecord : {}
}

function payload(event: OpenCodeEvent): UnknownRecord {
  return { ...event, ...record(event.properties), ...record(event.data) }
}

const QUESTION_TOOLS = new Set(["question", "functions.question", "functions_question"])

/** Only named question tools, never arbitrary tool input or output. */
export function questionToolEvent(value: unknown): OpenCodeEvent | undefined {
  const call = record(value)
  if (typeof call.tool !== "string" || !QUESTION_TOOLS.has(call.tool)) return undefined
  if (typeof call.sessionID !== "string" || !call.sessionID) return undefined
  return {
    type: "functions.question",
    data: { sessionID: call.sessionID, callID: call.id, input: call.input },
  }
}

function questionNotification(data: UnknownRecord): Notification {
  const input = record(data.input)
  const questions = Array.isArray(input.questions) ? input.questions : Array.isArray(data.questions) ? data.questions : []
  const first = record(questions[0])
  return {
    title: "Your input is required",
    message: compactDetails(first.question ?? first.header ?? input.question ?? data.question,
      "The agent is waiting for your answer."),
    priority: 4,
    tags: "question",
  }
}

/** IDs are scoped by session and kind; a form ID is not a tool call ID. */
export function questionNotificationKey(event: OpenCodeEvent): string | undefined {
  if (!["form.created", "question.asked", "functions.question"].includes(event.type)) return undefined
  const data = payload(event)
  const sessionID = eventSessionId(event)
  if (!sessionID) return undefined
  const form = record(data.form)
  const callID = data.callID ?? record(data.tool).callID
  const requestID = data.requestID ?? (event.type === "question.asked" ? record(event.data ?? event.properties).id : undefined)
  const kind = event.type === "form.created" ? "form" : typeof callID === "string" ? "question-call" : "question-request"
  const id = event.type === "form.created" ? form.id : callID ?? requestID
  if (typeof id === "string" && id) return JSON.stringify([sessionID, kind, id])
  // An envelope ID only identifies replays of that same event type.
  return typeof event.id === "string" && event.id ? JSON.stringify([sessionID, event.type, event.id]) : undefined
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
    // Compatibility signals, not declared native OpenCode V2 events.
    case "question.asked":
    case "functions.question":
      return questionNotification(data)
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
  const sessionID = data.sessionID ?? record(data.form).sessionID
  return typeof sessionID === "string" ? sessionID : undefined
}

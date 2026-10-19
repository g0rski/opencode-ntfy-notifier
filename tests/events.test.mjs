import test from "node:test"
import assert from "node:assert/strict"
import { eventNotification, eventSessionId, questionNotificationKey, questionToolEvent } from "../dist/events.js"
import { latestAssistantText, truncateText } from "../dist/text.js"

test("notifies only when a session goes idle; ignores busy", () => {
  assert.deepEqual(eventNotification({ type: "session.status", data: { sessionID: "ses_1", status: { type: "idle" } } }), {
    title: "Status changed to idle",
    message: "",
  })
  assert.equal(eventNotification({ type: "session.status", status: { type: "busy" } }), undefined)
})

test("maps permission and question events to actionable English titles", () => {
  assert.equal(eventNotification({ type: "permission.asked", data: { action: "edit", resources: ["src/app.ts"] } }).title, "Permission required")
  assert.equal(eventNotification({
    type: "form.created",
    data: { form: { title: "Deployment", fields: [{ type: "string", title: "Environment?" }] } },
  }).title, "Your input is required")
})

test("supports declared failure events and the requested session.error compatibility event", () => {
  assert.equal(eventNotification({ type: "session.execution.failed", data: { error: { message: "Provider unavailable" } } }).message, "Provider unavailable")
  assert.equal(eventNotification({ type: "session.error", data: { message: "Network error" } }).title, "Session error")
  assert.equal(eventNotification({ type: "session.compaction.failed" }).title, "Context compaction failed")
})

test("notifies on retry only at the configured escalation threshold", () => {
  assert.equal(eventNotification({ type: "session.status", data: { status: { type: "retry", attempt: 2, message: "retrying" } } }), undefined)
  assert.equal(eventNotification({ type: "session.status", data: { status: { type: "retry", attempt: 3, message: "retrying" } } }).title, "Session is retrying")
  assert.equal(eventNotification({ type: "session.status", data: { status: { type: "retry", attempt: 1, message: "retry", action: { label: "Sign in" } } } }).title, "Session needs attention")
})

test("extracts the latest assistant text and excludes tool output", () => {
  const messages = [
    { info: { role: "assistant" }, parts: [{ type: "text", text: "Earlier answer" }] },
    { info: { role: "assistant" }, parts: [{ type: "reasoning", text: "private reasoning" }, { type: "tool", text: "tool output" }, { type: "text", text: "Final answer" }] },
  ]
  assert.equal(latestAssistantText(messages), "Final answer")
  assert.equal(latestAssistantText([{ info: { role: "user" }, parts: [{ type: "text", text: "Question" }] }]), undefined)
})

test("truncates descriptions and finds session IDs on either event envelope", () => {
  assert.equal(truncateText("a".repeat(250)).length, 240)
  assert.equal(eventSessionId({ type: "permission.asked", data: { sessionID: "ses_abc" } }), "ses_abc")
})

test("recognizes exact question tool names without notifying on arbitrary tools", () => {
  for (const tool of ["question", "functions.question", "functions_question"]) {
    const event = questionToolEvent({ tool, sessionID: "ses_1", id: "call_1", input: { questions: [{ question: "Which environment?" }] } })
    assert.equal(eventNotification(event).message, "Which environment?")
    assert.equal(eventSessionId(event), "ses_1")
  }
  for (const tool of ["read", "execute", "my_question", "other.question", "functions.questionnaire", "Question"]) {
    assert.equal(questionToolEvent({ tool, sessionID: "ses_1" }), undefined)
  }
  for (const call of [null, [], {}, { tool: "question" }, { tool: "question", sessionID: "" }]) {
    assert.equal(questionToolEvent(call), undefined)
  }
})

test("compatibility questions support event envelopes and do not expose options or arbitrary input", () => {
  for (const type of ["functions.question", "question.asked"]) {
    for (const envelope of ["data", "properties"]) {
      const notification = eventNotification({ type, [envelope]: {
        input: { questions: [{ question: "Choose the target", options: [{ label: "secret option" }] }, { question: "secret second question" }], secret: "private" },
      } })
      assert.deepEqual(notification, { title: "Your input is required", message: "Choose the target", priority: 4, tags: "question" })
    }
    assert.equal(eventNotification({ type, questions: [{ header: "Deployment" }] }).message, "Deployment")
    assert.equal(eventNotification({ type, data: { question: "Continue?" } }).message, "Continue?")
    for (const input of [null, false, "arbitrary secret", [], { questions: [null] }, { secret: "private" }]) {
      assert.equal(eventNotification({ type, data: { input } }).message, "The agent is waiting for your answer.")
    }
    assert.equal(eventNotification({ type, questions: [{ question: "a".repeat(500) }] }).message.length, 240)
  }
})

test("question keys use stable IDs and never conflate sessions, kinds, or same-text questions", () => {
  const tool = questionToolEvent({ tool: "question", sessionID: "ses_1", id: "id_1" })
  const replay = { type: "functions.question", data: { sessionID: "ses_1", callID: "id_1" } }
  assert.equal(questionNotificationKey(tool), questionNotificationKey(replay))
  const form = { type: "form.created", data: { form: { sessionID: "ses_1", id: "id_1" } } }
  assert.equal(eventSessionId(form), "ses_1")
  assert.notEqual(questionNotificationKey(tool), questionNotificationKey(form))
  assert.notEqual(questionNotificationKey(tool), questionNotificationKey({ ...replay, data: { sessionID: "ses_2", callID: "id_1" } }))
  assert.notEqual(questionNotificationKey(tool), questionNotificationKey({ type: "question.asked", properties: { sessionID: "ses_1", id: "id_1" } }))
  assert.equal(questionNotificationKey({ type: "question.asked", sessionID: "ses_1", questions: [{ question: "Same text" }] }), undefined)
  assert.equal(questionNotificationKey({ type: "question.asked", id: "event_1", data: { sessionID: "ses_1" } }), '["ses_1","question.asked","event_1"]')
  assert.equal(questionNotificationKey({ type: "question.asked", requestID: "request_1" }), undefined)
  assert.equal(questionNotificationKey({ type: "session.status", sessionID: "ses_1", id: "event_1" }), undefined)
})

import test from "node:test"
import assert from "node:assert/strict"
import { eventNotification, eventSessionId } from "../dist/events.js"
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

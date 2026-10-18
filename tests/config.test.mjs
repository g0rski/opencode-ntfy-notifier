import test from "node:test"
import assert from "node:assert/strict"
import { readConfig } from "../dist/config.js"

test("requires a valid topic and defaults to ntfy.sh", () => {
  assert.deepEqual(readConfig({ NTFY_TOPIC: "my-opencode_topic" }), {
    topic: "my-opencode_topic",
    baseUrl: "https://ntfy.sh",
  })
})

test("accepts a self-hosted base URL and strips trailing slashes", () => {
  assert.deepEqual(readConfig({ NTFY_TOPIC: "alerts", NTFY_BASE_URL: "http://localhost:8080/ntfy/" }), {
    topic: "alerts",
    baseUrl: "http://localhost:8080/ntfy",
  })
})

test("rejects missing or unsafe topic names", () => {
  assert.throws(() => readConfig({}), /NTFY_TOPIC/)
  assert.throws(() => readConfig({ NTFY_TOPIC: "topic/path" }), /NTFY_TOPIC/)
  assert.throws(() => readConfig({ NTFY_TOPIC: "a".repeat(65) }), /NTFY_TOPIC/)
})

test("rejects unsupported base URL schemes and credentials", () => {
  assert.throws(() => readConfig({ NTFY_TOPIC: "alerts", NTFY_BASE_URL: "file:///tmp" }), /HTTP or HTTPS/)
  assert.throws(() => readConfig({ NTFY_TOPIC: "alerts", NTFY_BASE_URL: "https://user:pass@ntfy.sh" }), /credentials/)
})

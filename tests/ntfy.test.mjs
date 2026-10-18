import test from "node:test"
import assert from "node:assert/strict"
import { sendNotification } from "../dist/ntfy.js"

test("publishes a notification as JSON to the encoded topic URL", async () => {
  let request
  await sendNotification({ topic: "my topic", baseUrl: "https://ntfy.example" }, { title: "Session done", message: "Finished" }, async (url, init) => {
    request = { url, init }
    return new Response(null, { status: 200 })
  })
  assert.equal(request.url, "https://ntfy.example/my%20topic")
  assert.equal(request.init.method, "POST")
  assert.deepEqual(JSON.parse(request.init.body), { title: "Session done", message: "Finished" })
})

test("does not retry permanent HTTP errors", async () => {
  let attempts = 0
  await assert.rejects(sendNotification({ topic: "alerts", baseUrl: "https://ntfy.example" }, { title: "Error", message: "bad" }, async () => {
    attempts++
    return new Response(null, { status: 401 })
  }), /HTTP 401/)
  assert.equal(attempts, 1)
})

test("retries a temporary server error", async () => {
  let attempts = 0
  await sendNotification({ topic: "alerts", baseUrl: "https://ntfy.example" }, { title: "Ready", message: "done" }, async () => {
    attempts++
    return new Response(null, { status: attempts === 1 ? 503 : 200 })
  })
  assert.equal(attempts, 2)
})

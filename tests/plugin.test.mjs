import test from "node:test"
import assert from "node:assert/strict"
import plugin from "../dist/index.js"

async function flush() {
  for (let i = 0; i < 20; i++) await new Promise(setImmediate)
}

async function harness(t, fetchImpl) {
  const originalFetch = globalThis.fetch
  const originalEnv = { topic: process.env.NTFY_TOPIC, baseUrl: process.env.NTFY_BASE_URL }
  process.env.NTFY_TOPIC = "test-topic"
  process.env.NTFY_BASE_URL = "https://ntfy.example"
  const delivered = []
  const buffered = []
  let wake
  let hook
  let disposed = false
  let signal
  globalThis.fetch = async (url, options) => {
    delivered.push(JSON.parse(options.body))
    return fetchImpl ? fetchImpl(url, options) : new Response(null, { status: 200 })
  }
  const cleanup = await plugin.setup({
    tool: {
      async hook(name, callback) {
        assert.equal(name, "execute.before")
        hook = callback
        return { async dispose() { disposed = true } }
      },
    },
    session: { async context() { return [] } },
    event: {
      async *subscribe(options) {
        signal = options.signal
        while (!signal.aborted) {
          if (buffered.length) yield buffered.shift()
          else await new Promise((resolve) => {
            wake = resolve
            signal.addEventListener("abort", resolve, { once: true })
          })
        }
      },
    },
  })
  t.after(async () => {
    await cleanup()
    globalThis.fetch = originalFetch
    for (const [key, value] of [["NTFY_TOPIC", originalEnv.topic], ["NTFY_BASE_URL", originalEnv.baseUrl]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  return {
    delivered,
    hook: (call) => hook(call),
    emit(event) { buffered.push(event); wake?.() },
    cleanup,
    get disposed() { return disposed },
    get aborted() { return signal.aborted },
  }
}

const question = (id = "call_1") => ({ tool: "functions.question", sessionID: "ses_1", id, input: { questions: [{ question: "Which target?" }] } })

test("question hooks enqueue without awaiting ntfy and ignore unrelated tools", async (t) => {
  let release
  const blocked = new Promise((resolve) => { release = resolve })
  const h = await harness(t, () => blocked)
  t.after(() => release(new Response(null, { status: 200 })))
  assert.equal(h.hook(question()), undefined)
  h.hook({ ...question(), tool: "read" })
  await flush()
  assert.equal(h.delivered.length, 1)
  assert.equal(h.delivered[0].message, "Which target?")
  await h.cleanup()
  assert.equal(h.aborted, true)
  assert.equal(h.disposed, true)
  h.hook(question("after_cleanup"))
  await flush()
  assert.equal(h.delivered.length, 1)
})

test("stream and hook dedupe explicit call IDs, not distinct or ID-less questions", async (t) => {
  const h = await harness(t)
  h.hook(question())
  h.emit({ type: "functions.question", data: { sessionID: "ses_1", callID: "call_1" } })
  h.hook(question("call_2"))
  h.hook({ ...question(), id: undefined })
  h.hook({ ...question(), id: undefined })
  const form = { type: "form.created", data: { form: { sessionID: "ses_1", id: "form_1", fields: [{ title: "Native form" }] } } }
  h.emit(form)
  h.emit(form)
  await flush()
  assert.equal(h.delivered.length, 5)
  assert.equal(h.delivered.at(-1).message, "Native form")
})

test("irrelevant event floods cannot fill the notification queue", async (t) => {
  let release
  const blocked = new Promise((resolve) => { release = resolve })
  let count = 0
  const h = await harness(t, () => ++count === 1 ? blocked : new Response(null, { status: 200 }))
  t.after(() => release(new Response(null, { status: 200 })))
  h.hook(question())
  for (let i = 0; i < 500; i++) h.emit({ type: "session.text.delta", data: { text: "private token" } })
  h.emit({ type: "question.asked", data: { sessionID: "ses_1", id: "req_1", questions: [{ question: "Second question" }] } })
  await flush()
  release(new Response(null, { status: 200 }))
  await flush()
  assert.equal(h.delivered.length, 2)
  assert.equal(h.delivered[1].message, "Second question")
})

test("failed delivery does not mark a question as successfully notified", async (t) => {
  let count = 0
  const h = await harness(t, () => new Response(null, { status: ++count === 1 ? 403 : 200 }))
  h.hook(question())
  await flush()
  h.hook(question())
  await flush()
  assert.equal(h.delivered.length, 2)
})

test("question dedupe expires after five minutes and is isolated by session", async (t) => {
  const realNow = Date.now
  let now = realNow()
  Date.now = () => now
  t.after(() => { Date.now = realNow })
  const h = await harness(t)
  h.hook(question())
  await flush()
  now += 299_999
  h.hook(question())
  h.hook({ ...question(), sessionID: "ses_2" })
  await flush()
  assert.equal(h.delivered.length, 2)
  now++
  h.hook(question())
  await flush()
  assert.equal(h.delivered.length, 3)
})

test("question dedupe retains at most 1000 recent identities", async (t) => {
  const h = await harness(t)
  for (let i = 0; i < 1_001; i++) {
    h.hook(question(`call_${i}`))
    if (i % 50 === 0) await flush()
  }
  await flush()
  assert.equal(h.delivered.length, 1_001)
  h.hook(question("call_1000"))
  h.hook(question("call_0"))
  await flush()
  assert.equal(h.delivered.length, 1_002)
})

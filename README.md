# opencode-ntfy-notifier

An OpenCode V2 plugin that sends concise session notifications to an [ntfy](https://ntfy.sh) topic. Notification titles and fixed text are in English; excerpts from your session remain in the language you used. The plugin never makes extra model calls.

## Install

Add the package to your OpenCode configuration (`opencode.json` or `opencode.jsonc`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-ntfy-notifier"]
}
```

Set the environment variables for the OpenCode process:

```sh
export NTFY_TOPIC="a-long-random-topic-name"
# Optional; defaults to https://ntfy.sh
export NTFY_BASE_URL="https://ntfy.sh"
```

`NTFY_TOPIC` is required. Topics on public ntfy servers are public channels: choose an unpredictable topic name and do not include sensitive information in session messages. To use an authenticated/private ntfy installation, configure the server's access policy accordingly; this plugin currently does not provide authentication headers.

The variables must be present in the environment of the OpenCode server/service that loads plugins, not merely in a shell that launches a client connected to an already-running service.

## Notifications

| Event | When it sends | Title |
| --- | --- | --- |
| `session.status` | Status changes to `idle`; body uses the latest assistant text excerpt | `Status changed to idle` |
| `permission.asked` | OpenCode asks for permission | `Permission required` |
| `form.created` | A question/form is waiting for input | `Your input is required` |
| Tool hook `execute.before` | A `question`, `functions.question`, or `functions_question` tool is invoked | `Your input is required` |
| `question.asked`, `functions.question` | Compatibility with wrappers/servers that emit these signals directly | `Your input is required` |
| `session.execution.failed` | A session execution fails | `Session failed` |
| `session.error` | Compatibility with servers that emit this event | `Session error` |
| `session.status` (`retry`) | User action is indicated, or retry attempt reaches three | `Session needs attention` / `Session is retrying` |
| `session.compaction.failed` | Context compaction fails | `Context compaction failed` |

Messages are shortened to about 240 characters. The plugin only sends notification-relevant event details and short assistant text excerpts; it does not send full transcripts or reasoning. Error notifications are deduplicated briefly to avoid duplicate alerts when a server emits both a generic and specific failure event.

## Behavior and limitations

- Notifications are best-effort. The plugin uses a live event stream; events missed while OpenCode or the plugin is offline cannot be recovered.
- Temporary network/server errors receive a small bounded retry; ntfy failures never stop the OpenCode session.
- If the last assistant text is not available at the time the session becomes idle, a short English fallback is sent.
- This is an OpenCode V2 plugin. `session.execution.failed` is the declared V2 failure event. `session.error` is also recognized defensively, but is not declared in the inspected V2 public event schema.
- The plugin does not subscribe to every message/tool event, to avoid noisy notifications.
- In Codeman, `functions.question` can be the displayed tool name rather than an event type. The V2 tool hook detects question calls before they wait for an answer, without waiting for ntfy delivery. Only the exact question tool names listed above are recognized; unrelated tools and completed tool output do not trigger alerts.
- Question alerts include only the first question's short text (or a generic fallback), not the full questionnaire, options, answers, or arbitrary tool arguments. Native V2 forms still use `form.created`; `question.asked` and a direct `functions.question` event are defensive compatibility paths, not guaranteed V2 events. This does not add V1 plugin API support.
- Repeated question signals with the same explicit session and request/call/form ID are deduplicated for five minutes (up to 1,000 recent IDs). Different IDs and signals without IDs are not merged, even when the text is identical. Form IDs and tool call IDs are separate identities, so a tool that also creates a native form can produce two alerts; suppressing them by timing alone could hide a separate question.
- Only notification-relevant events enter the bounded delivery queue; token/message streaming cannot fill it.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run pack:check
```

## Releases

CI verifies pull requests and pushes to `main` without release permissions. A separate release workflow starts only after a successful CI run for a push to `main`; it checks out the exact tested commit, reruns the checks, creates the matching immutable `v<version>` tag, and publishes to npm. Pull request builds never create tags or publish. The repository must have an `NPM_TOKEN` Actions secret with permission to publish this package. Bump both `package.json` and `package-lock.json` before the next release; the release job fails rather than moving or overwriting an existing tag.

## License

Apache-2.0. See [LICENSE](./LICENSE).

# Contributing

Thanks for helping improve FreeScribe.

## Development Setup

```bash
npm install
npm test
npm run build
```

Load `dist` from `chrome://extensions` as an unpacked extension.

## Pull Request Expectations

Before opening a pull request:

- Run `npm test`.
- Run `npm run build`.
- Manually test the extension in a Google Meet session when changing content extraction, background messaging, storage, or side panel behavior.
- Avoid including private meeting content, transcript data, credentials, or screenshots with sensitive participant information.
- Keep permission changes minimal and explain why they are necessary.

## Coding Guidelines

- Keep privacy boundaries explicit. Caption text should only be captured during an active user-started recording session.
- Prefer structured message payloads and runtime validation at extension context boundaries.
- Add focused tests for reducer, export, storage, and DOM extraction changes.
- Keep generated folders such as `dist`, `test-dist`, `release`, and `node_modules` out of commits.

## Manual QA

For user-facing or extension-runtime changes, verify:

1. The side panel shows the correct state on non-Meet pages.
2. Start fails clearly if the Meet tab needs a refresh.
3. Captions are captured only after clicking Start.
4. Pause and Stop halt capture.
5. Resume restarts capture.
6. Save downloads a readable `.txt` transcript.
7. Clear removes local transcript state for the current meeting.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.

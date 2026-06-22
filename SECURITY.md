# Security Policy

## Supported Versions

FreeScribe is currently distributed as source for local installation. Security and privacy fixes are handled on the default branch until formal releases are introduced.

## Reporting a Vulnerability

Do not include private meeting content, transcript data, Gemini API keys, credentials, access tokens, or personal data in public GitHub issues.

Report security or privacy concerns through the repository's private security advisory process. Include:

- A short description of the issue
- Impact and affected workflow
- Steps to reproduce with synthetic or redacted data
- Browser and extension version or commit SHA

We aim to acknowledge reports within 5 business days and will coordinate remediation before public disclosure when appropriate.

## Scope

Security reports may include:

- Transcript over-collection or unexpected data retention
- Unexpected Gemini API calls when AI is disabled or no key is configured
- Accidental exposure of API keys in source, generated builds, release artifacts, logs, or screenshots
- Extension permission misuse
- Cross-context message handling flaws
- Download/export privacy issues
- Build or release integrity concerns

General feature requests and non-sensitive bugs should use GitHub issues.

## Gemini API Key Handling

Gemini meeting notes are optional, explicit opt-in, and intended for local source builds. If `FREESCRIBE_AI_ENABLED` is not exactly `true`, or if `FREESCRIBE_GEMINI_API_KEY` is empty, transcript capture/export should keep working without Gemini network permission.

When a Gemini key is configured, the build injects it into `dist/background.js` and adds `https://generativelanguage.googleapis.com/*` to the generated extension manifest. Treat keyed `dist` folders and ZIPs as sensitive local artifacts. Do not commit, publish, upload, or attach builds that contain a personal API key.

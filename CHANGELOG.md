# Changelog

All notable changes to FreeScribe will be documented in this file.

The project follows conventional commits for change descriptions.

## Unreleased

### Added

- Optional Gemini-powered meeting notes generation for executive summaries, action items, and Minutes of Meeting.
- Markdown export and copy support for generated AI meeting notes.
- Build-time `.env` configuration with `FREESCRIBE_AI_ENABLED`, `GEMINI_API_KEY`, and `GEMINI_MODEL`.
- Dynamic Gemini host permission generation so no-key or AI-disabled builds keep the original local transcript workflow.
- Storage migration and tests for persisted AI artifacts.

## 0.1.0 - 2026-06-21

### Added

- Initial local-install Chrome MV3 extension for capturing visible Google Meet captions.
- Local transcript storage and plain text export.
- Side panel controls for start, pause, resume, stop, clear, copy, and save.
- Unit tests for transcript reduction, text export, and filename slugging.

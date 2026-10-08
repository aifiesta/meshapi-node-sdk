# Changelog

## Unreleased

### Added

- `WebSearchParams.include_page_content` returns each result's extracted page text
  in the new `WebSearchResultItem.page_content`, so one call replaces
  search-then-fetch. `page_content_truncated` says when that text was cut at the
  server's per-result ceiling, so a truncated page is never served as a whole one.
  Only the `tinyfish` engine returns page text and the native engine is tried
  first, so pin `provider: "tinyfish"` when you need it.
- `WebSearchParams.provider` accepts `"tinyfish"`. It has been a valid value on the
  API for some time, but the union here rejected it, so the engine could not be
  pinned from this SDK at all.
- Leaving `include_page_content` unset sends no new key, so existing calls are
  byte-identical on the wire.

## 2.0.1

### Fixed

- **`timeoutMs` no longer aborts a stream that is still sending.** For streaming
  calls it was documented as a time-to-first-byte limit, but the timer stayed
  attached to the response body, so any stream longer than `timeoutMs` (default
  60 s) died mid-generation with `TimeoutError`. It now bounds only the wait for
  response headers; cancel a live stream with your own `AbortSignal` or
  `stream.cancel()`.

# Changelog

## 2.0.1

### Fixed

- **`timeoutMs` no longer aborts a stream that is still sending.** For streaming
  calls it was documented as a time-to-first-byte limit, but the timer stayed
  attached to the response body, so any stream longer than `timeoutMs` (default
  60 s) died mid-generation with `TimeoutError`. It now bounds only the wait for
  response headers; cancel a live stream with your own `AbortSignal` or
  `stream.cancel()`.

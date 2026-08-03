# Changelog

## 1.1.1 - 2026-08-03

### Added

- `LibRawError`, with the stable numeric LibRaw error code and diagnostic text

### Fixed

- Decoded direct C string pointers correctly, restoring LibRaw diagnostics and
  unpack-function names
- Enabled C++ exception handling in the WebAssembly build so truncated inputs
  return LibRaw I/O errors instead of raw WebAssembly exception values
- Reported processing-memory errors through the same typed error path

## 1.1.0 - 2026-08-03

### Added

- Analysis getters for stored and visible geometry, source layout, black and
  saturation data, and camera characterization
- Processing setters for half-size decoding and camera white balance
- X3F decoder support in the WebAssembly build

### Fixed

- Corrected npm repository, homepage, issue tracker, and package documentation
- Included LibRaw's copyright, CDDL, and LGPL files in the npm package
- Released copied input buffers on failed opens, recycling, replacement, and
  disposal
- Returned deterministic, owned, tightly packed arrays from the 16-bit source
  pixel getters
- Stopped WebAssembly build failures from being suppressed

### Compatibility

The source-pixel getters now return `Uint16Array | null`, matching runtime
behavior across one-, three-, and four-component source layouts. Non-null
arrays own their storage and remain valid after WebAssembly memory growth,
recycling, or disposal.

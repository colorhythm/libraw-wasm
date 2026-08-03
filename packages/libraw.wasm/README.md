<!-- This README is duplicated at the repository root and package directory. -->

# @colorhythm/libraw-wasm

[![npm version](https://img.shields.io/npm/v/%40colorhythm%2Flibraw-wasm.svg)](https://www.npmjs.com/package/@colorhythm/libraw-wasm)

TypeScript bindings for [LibRaw](https://www.libraw.org/), compiled to
WebAssembly for browser and Node.js camera-raw decoding. Colorhythm maintains
this fork for applications that need direct, analysis-oriented access to
sensor data—not only a rendered RGB image.

The package is intentionally low-level. It can expose the stored sensor buffer,
visible image geometry, color-filter facts, camera characterization, black and
saturation levels, embedded metadata, thumbnails, and LibRaw's processed
output. Heavy decoding and pixel statistics should normally run in a Worker.

## What Colorhythm adds

This fork preserves the original API and adds surfaces needed for browser-side
camera-raw analysis:

- Stored and visible geometry, including margins, orientation, pixel
  aspect, and row pitch
- CFA and Foveon source facts, plus 16-bit one-, three-, and four-component
  buffers
- Camera matrices, channel descriptions, and white-balance multipliers
- Rawpy-compatible adjusted black levels and reported per-channel linear maxima
- Processing setters for `half_size` and `use_camera_wb`
- Typed `LibRawError` diagnostics with stable numeric LibRaw error codes
- LibRaw's X3F decoder compiled into the WebAssembly build

## Install

```sh
npm install @colorhythm/libraw-wasm
```

The generated module loads `libraw.wasm` beside itself through `import.meta.url`
in Node.js and compatible bundlers. The WebAssembly binary is also
exported as `@colorhythm/libraw-wasm/libraw.wasm` for applications with a
custom asset pipeline.

## Inspect a camera-raw file

```ts
import { LibRaw } from "@colorhythm/libraw-wasm";

async function inspectCameraRaw(file: File) {
    await LibRaw.initialize();

    const decoder = new LibRaw();
    await decoder.waitUntilReady();

    try {
        decoder.open(await file.arrayBuffer());
        decoder.unpack();

        const source =
            decoder.getRawImage() ??
            decoder.getColor3Image() ??
            decoder.getColor4Image();

        if (source === null) {
            throw new Error("LibRaw did not expose an unpacked source buffer");
        }

        const camera = decoder.getIParams();

        return {
            blackLevels: [0, 1, 2, 3].map((index) =>
                decoder.getBlackLevel(index),
            ),
            camera: `${camera.normalized_make} ${camera.normalized_model}`,
            geometry: {
                activeHeight: decoder.getActiveHeight(),
                activeWidth: decoder.getActiveWidth(),
                marginLeft: decoder.getLeftMargin(),
                marginTop: decoder.getTopMargin(),
                storedHeight: decoder.getRawHeight(),
                storedWidth: decoder.getRawWidth(),
            },
            sourceSamples: source.length,
        };
    } finally {
        decoder.dispose();
    }
}
```

`getRawImage()`, `getColor3Image()`, and `getColor4Image()` return
owned `Uint16Array` copies after `unpack()`. They remain valid after another
decode, `recycle()`, WebAssembly memory growth, or `dispose()`. A method returns
`null` when LibRaw does not expose that source layout for the file. The current
binding does not expose LibRaw's floating-point source buffers.

## 1.1.0 compatibility note

Version 1.1.0 corrects the source-pixel return contract introduced in 1.0.0.
The TypeScript return type is `Uint16Array | null`, each non-null array has the
exact unpacked length without row padding, and every array owns its storage.
Code that assumed the earlier non-null type should select the available source
layout explicitly, as in the example above.

## Error handling

LibRaw failures throw `LibRawError`, which preserves the numeric LibRaw error
code alongside its diagnostic message:

```ts
import { LibRawError } from "@colorhythm/libraw-wasm";

try {
    decoder.open(buffer);
} catch (error) {
    if (error instanceof LibRawError) {
        console.error(error.code, error.message);
    }
    throw error;
}
```

## Analysis API

| Area | Methods | Notes |
| --- | --- | --- |
| Geometry | `getActiveHeight()`, `getActiveWidth()`, `getRawHeight()`, `getRawWidth()`, `getRawPitch()`, margin getters, `getFlip()`, `getPixelAspect()` | Raw dimensions describe stored data; LibRaw's visible dimensions and margins locate the image area. These values are not necessarily the literal DNG `ActiveArea`. Pitch is measured in bytes. |
| Source layout | `getColors()`, `getCdesc()`, `getFilters()`, `getIsFoveon()`, `color()` | Describes CFA and multi-channel source organization. `getCdesc()` returns a character code. |
| Source pixels | `getRawImage()`, `getColor3Image()`, `getColor4Image()` | Returns the unpacked 16-bit source buffer that LibRaw exposes for the file. |
| Levels | `getBlackLevel()`, `getLinearMax()`, `getColorMaximum()`, `getDataMaximum()` | Exposes adjusted per-channel black levels, per-channel linear maxima, and LibRaw's common and observed maxima. A per-channel linear maximum can be `0` when the file does not provide one. |
| Characterization | `getCamMul()`, `getPreMul()`, `getCamXyz()`, `getCmatrix()`, `getRgbCam()` | Exposes camera white-balance multipliers and numeric color matrices. |
| Descriptive metadata | `getIParams()`, `getImgOther()`, `getLensInfo()`, `getMakernotes()`, `getShootingInfo()` | Reads LibRaw's typed metadata structures. Use a dedicated metadata parser when complete tag coverage is required. |
| Thumbnails and rendering | `unpackThumb()`, `dcrawMakeMemThumb()`, `dcrawProcess()`, `dcrawMakeMemImage()` | Provides embedded previews and LibRaw's processed output path. |

Static methods expose the compiled LibRaw version, supported camera count, and
camera list:

```ts
await LibRaw.initialize();

console.log(LibRaw.version());
console.log(LibRaw.cameraCount());
console.log(LibRaw.cameraList());
```

## Processing policy

Set processing parameters before `dcrawProcess()`. `setHalfSize(1)` requests
half linear dimensions, while `setUseCameraWb(1)` requests the camera's as-shot
white-balance multipliers. Applications should also choose their output color
space explicitly with `setOutputColor()` rather than inherit an implicit
LibRaw default.

The unpacked source path does not call `dcrawProcess()` and therefore remains
appropriate for sensor-native analysis.

## Worker use

Camera-raw decoding and full-resolution statistics can consume substantial CPU
time and memory. In browser applications, create and use `LibRaw` inside a
dedicated Worker. Transfer the input `ArrayBuffer` to the Worker, perform
analysis there, and return only the summaries or pixel data the interface
needs.

Each successful `open()` keeps its copied input alive until another `open()`,
`recycle()`, or `dispose()` releases it. Reuse a decoder for sequential jobs or
dispose it when the Worker is finished. Source-pixel getters return owned
copies that can be transferred or retained independently.

## WebAssembly loading and lifecycle

`LibRaw.initialize()` is shared within a JavaScript realm, and its first call
selects the WebAssembly payload. Supply any custom `Response` or `ArrayBuffer`
before constructing a decoder:

```ts
const response = await fetch("/assets/libraw.wasm");

if (!response.ok) {
    throw new Error(`Unable to load LibRaw WASM: ${response.status}`);
}

await LibRaw.initialize(await response.arrayBuffer());
```

Passing an `ArrayBuffer` avoids a dependency on the server's WebAssembly MIME
type. Passing a `Response` enables streaming compilation and requires the
server to send `application/wasm`.

## Develop

Clone with submodules, install the workspace, and run the checks:

```sh
git clone --recurse-submodules https://github.com/colorhythm/libraw-wasm.git
cd libraw-wasm
corepack enable
pnpm install
pnpm check
pnpm test
```

Rebuilding the WebAssembly binary requires `make` and Emscripten. Put `emcc`
and `em++` on `PATH`, set `SYSROOT` to Emscripten's `cache/sysroot` directory,
then run `pnpm build`. The repository's
[build setup action](https://github.com/colorhythm/libraw-wasm/blob/main/.github/actions/setup-build/action.yml)
is the executable reference for the supported toolchain.

## Lineage and thanks

This is Colorhythm's maintained fork of
[libraw.wasm](https://github.com/ssssota/libraw.wasm) by
[TOMIKAWA Sotaro](https://github.com/ssssota). His TypeScript bindings and
WebAssembly build made browser-side LibRaw practical to extend. Thank you,
Sotaro.

[LibRaw](https://github.com/LibRaw/LibRaw) is developed by LibRaw LLC and its
contributors.

## License

The TypeScript and WebAssembly wrapper is available under the
[MIT License](https://github.com/colorhythm/libraw-wasm/blob/main/packages/libraw.wasm/LICENSE).
The included LibRaw source is available under either
[LGPL 2.1](https://github.com/colorhythm/libraw-wasm/blob/main/packages/libraw.wasm/LibRaw/LICENSE.LGPL)
or
[CDDL 1.0](https://github.com/colorhythm/libraw-wasm/blob/main/packages/libraw.wasm/LibRaw/LICENSE.CDDL).
See LibRaw's
[copyright and notices](https://github.com/colorhythm/libraw-wasm/blob/main/packages/libraw.wasm/LibRaw/COPYRIGHT)
for its included third-party components. The npm tarball includes all three
LibRaw files under `LibRaw/`.

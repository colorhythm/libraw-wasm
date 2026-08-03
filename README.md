> **Fork notice & thanks** — this is Colorhythm's fork of
> [**libraw.wasm** by TOMIKAWA Sotaro (ssssota)](https://github.com/ssssota/libraw.wasm),
> whose clean TypeScript bindings over a WebAssembly build of
> [LibRaw](https://www.libraw.org/) (LibRaw LLC) made browser-side raw
> decoding straightforward to build on. Thank you, Sotaro.

Colorhythm's fork enables LibRaw's X3F decoder and adds narrow getters for
browser-side image analysis:

- Active and stored geometry, margins, orientation, pixel aspect, and row pitch
- CFA and source facts, including Foveon and planar source buffers
- Camera matrices and white-balance multipliers
- Rawpy-compatible adjusted black levels and per-channel saturation levels

The fork also exposes processing-parameter setters for `half_size` and
`use_camera_wb`.

# libraw-wasm

This is a WebAssembly build of [LibRaw](https://www.libraw.org/), a library for reading raw images.

## LICENSE

libraw-wasm is licensed under the [MIT license](LICENSE).

This project includes the LibRaw, which is licensed under the **LGPL 2.1** and the **CDDL 1.0**.

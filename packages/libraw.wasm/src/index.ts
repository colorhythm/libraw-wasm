import * as typ from "typed-cstruct";

import {
    libraw_imgother_t,
    libraw_iparams_t,
    libraw_lensinfo_t,
    libraw_makernotes_lens_t,
    libraw_makernotes_t,
    libraw_processed_image_t,
    libraw_shootinginfo_t,
    libraw_thumbnail_t,
} from "./libraw-types.js";
// @ts-expect-error
import initializeLibRawWasm from "./libraw.mjs";
import type {
    CharPtr,
    ErrorCode,
    Float,
    Int,
    LibRawDataT,
    LibRawProcessedImageT,
    LibRawWasmModule,
    Ptr,
} from "./types/index.js";

type PromiseOr<T> = T | Promise<T>;
type WasmInput = PromiseOr<Response | ArrayBuffer>;

const imgother_t = libraw_imgother_t()
    .override("desc", typ.sizedCharArrayAsString(512))
    .override("artist", typ.sizedCharArrayAsString(64));
const iparams_t = libraw_iparams_t()
    .override("make", typ.sizedCharArrayAsString(64))
    .override("model", typ.sizedCharArrayAsString(64))
    .override("software", typ.sizedCharArrayAsString(64))
    .override("normalized_make", typ.sizedCharArrayAsString(64))
    .override("normalized_model", typ.sizedCharArrayAsString(64))
    .override("cdesc", typ.sizedCharArrayAsString(5))
    .override("xmpdata", typ.charPointerAsString());
const makernotes_lens_t = libraw_makernotes_lens_t()
    .override("Lens", typ.sizedCharArrayAsString(128))
    .override("body", typ.sizedCharArrayAsString(64))
    .override(
        "FocalType",
        typ.enumLike(typ.i16, {
            unknown: 0,
            "fixed focal": 1,
            zoom: 2,
        } as const),
    )
    .override("LensFeatures_pre", typ.sizedCharArrayAsString(16))
    .override("LensFeatures_suf", typ.sizedCharArrayAsString(16))
    .override("Teleconverter", typ.sizedCharArrayAsString(128))
    .override("Adapter", typ.sizedCharArrayAsString(128))
    .override("Attachment", typ.sizedCharArrayAsString(128));
const lensinfo_t = libraw_lensinfo_t()
    .override("LensMake", typ.sizedCharArrayAsString(128))
    .override("Lens", typ.sizedCharArrayAsString(128))
    .override("LensSerial", typ.sizedCharArrayAsString(128))
    .override("InternalLensSerial", typ.sizedCharArrayAsString(128))
    .override("makernotes", makernotes_lens_t);
const processed_image_t = libraw_processed_image_t().override("data", {
    size: 1,
    read(opts, ctx) {
        const offset = opts.offset ?? 0;
        const size = ctx.data_size;
        return opts.buf.slice(offset, offset + size);
    },
});
const shootinginfo_t = libraw_shootinginfo_t()
    .override("BodySerial", typ.sizedCharArrayAsString(64))
    .override("InternalBodySerial", typ.sizedCharArrayAsString(64));
const makernotes_t = libraw_makernotes_t();
const thumbnail_t = libraw_thumbnail_t().override(
    "thumb",
    typ.pointerArrayFromLengthField(typ.u8, "tlength"),
);

export class LibRawError extends Error {
    readonly code: number;

    constructor(code: number, message: string) {
        super(message);
        this.code = code;
        this.name = "LibRawError";
    }
}

export class LibRaw implements Disposable {
    private static modulePromise: Promise<LibRawWasmModule> | undefined;
    private static module: LibRawWasmModule;
    private lr = 0 as LibRawDataT;
    private inputPtr = 0 as Ptr;
    private _status: "disposed" | "loading" | "ready" = "loading";
    get status() {
        return this._status;
    }
    constructor() {
        this.setup();
    }
    static async initialize(wasm?: WasmInput) {
        if (LibRaw.modulePromise === undefined) {
            const mod: Promise<LibRawWasmModule> = initializeLibRawWasm({
                instantiateWasm: LibRaw.createInstantiateWasm(wasm),
            });
            LibRaw.modulePromise = mod;
            LibRaw.module = await mod;
        }
        return await LibRaw.modulePromise;
    }
    private static createInstantiateWasm(wasm?: WasmInput) {
        if (wasm === undefined) return undefined;
        return async (
            importObject: WebAssembly.Imports,
            cb: (
                instance: WebAssembly.Instance,
                module: WebAssembly.Module,
            ) => void,
        ) => {
            const wasmResponse = await wasm;
            const instantiated = await (wasmResponse instanceof Response
                ? WebAssembly.instantiateStreaming(wasmResponse, importObject)
                : WebAssembly.instantiate(wasmResponse, importObject));
            cb(instantiated.instance, instantiated.module);
        };
    }
    async waitUntilReady() {
        await LibRaw.modulePromise;
    }
    private async setup() {
        await LibRaw.initialize();
        this._status = "ready";
        this.lr ||= LibRaw.module._libraw_init(0);
    }
    open(buffer: ArrayBufferLike) {
        if (buffer.byteLength === 0) {
            throw new RangeError("Cannot open an empty camera-raw buffer");
        }

        this.recycle();
        const dataPtr = LibRaw.module._malloc(buffer.byteLength);
        if (!dataPtr) {
            throw new Error(
                `Unable to allocate ${buffer.byteLength} bytes for camera-raw input`,
            );
        }

        try {
            const dataHeap = new Uint8Array(
                LibRaw.module.HEAPU8.buffer,
                dataPtr,
                buffer.byteLength,
            );
            dataHeap.set(new Uint8Array(buffer));
            this.handleError(
                LibRaw.module._libraw_open_buffer(
                    this.lr,
                    dataPtr,
                    buffer.byteLength,
                ),
            );
            this.inputPtr = dataPtr;
        } catch (error) {
            LibRaw.module._libraw_recycle(this.lr);
            LibRaw.module._free(dataPtr);
            throw error;
        }
    }
    unpack() {
        this.handleError(LibRaw.module._libraw_unpack(this.lr));
    }
    unpackThumb() {
        this.handleError(LibRaw.module._libraw_unpack_thumb(this.lr));
    }
    unpackThumbEx(i: Int) {
        this.handleError(LibRaw.module._libraw_unpack_thumb_ex(this.lr, i));
    }
    raw2image() {
        this.handleError(LibRaw.module._libraw_raw2image(this.lr));
    }
    dcrawProcess() {
        this.handleError(LibRaw.module._libraw_dcraw_process(this.lr));
    }
    dcrawMakeMemImage() {
        const errcPtr = LibRaw.module._malloc(4);
        const ptr = LibRaw.module._libraw_dcraw_make_mem_image(
            this.lr,
            errcPtr,
        );
        const code = this.readI32(errcPtr);
        LibRaw.module._free(errcPtr);
        if (!ptr) {
            this.handleError(code as ErrorCode);
            throw new Error("LibRaw did not return a processed image");
        }
        const ret = this.readProcessedImage(ptr);
        LibRaw.module._libraw_dcraw_clear_mem(ptr);
        return ret;
    }
    dcrawMakeMemThumb() {
        const errcPtr = LibRaw.module._malloc(4);
        const ptr = LibRaw.module._libraw_dcraw_make_mem_thumb(
            this.lr,
            errcPtr,
        );
        const code = this.readI32(errcPtr);
        LibRaw.module._free(errcPtr);
        this.handleError(code as ErrorCode);
        if (!ptr) throw new Error("Unexpected error");
        const ret = this.readProcessedImage(ptr);
        LibRaw.module._libraw_dcraw_clear_mem(ptr);
        return ret;
    }
    private readProcessedImage(processed: LibRawProcessedImageT) {
        return processed_image_t.read({
            buf: LibRaw.module.HEAPU8,
            offset: processed,
        });
    }
    private readRawPixels(ptr: Ptr, channels: number) {
        if (!ptr) return null;
        const height = this.getRawHeight();
        const rowLength = this.getRawWidth() * channels;
        const pitch = this.getRawPitch();
        const stride = pitch
            ? pitch / Uint16Array.BYTES_PER_ELEMENT
            : rowLength;
        if (!Number.isInteger(stride) || stride < rowLength) {
            throw new Error(
                `Raw pitch ${pitch} bytes cannot contain ${rowLength} 16-bit values`,
            );
        }
        const source = new Uint16Array(
            LibRaw.module.HEAPU8.buffer,
            ptr,
            stride * height,
        );
        if (stride === rowLength) return source.slice();
        const pixels = new Uint16Array(rowLength * height);
        for (let row = 0; row < height; row++) {
            const start = row * stride;
            pixels.set(
                source.subarray(start, start + rowLength),
                row * rowLength,
            );
        }
        return pixels;
    }
    getActiveHeight() {
        return LibRaw.module._libraw_get_active_height(this.lr);
    }
    getActiveWidth() {
        return LibRaw.module._libraw_get_active_width(this.lr);
    }
    getBlackLevel(index: Int) {
        return LibRaw.module._libraw_get_black_level(this.lr, index);
    }
    getBottomMargin() {
        return LibRaw.module._libraw_get_bottom_margin(this.lr);
    }
    getCdesc(index: Int) {
        return LibRaw.module._libraw_get_cdesc(this.lr, index);
    }
    getCmatrix(i: Int, j: Int) {
        return LibRaw.module._libraw_get_cmatrix(this.lr, i, j);
    }
    getColors() {
        return LibRaw.module._libraw_get_colors(this.lr);
    }
    getFilters() {
        return LibRaw.module._libraw_get_filters(this.lr);
    }
    getFlip() {
        return LibRaw.module._libraw_get_flip(this.lr);
    }
    getIsFoveon() {
        return Boolean(LibRaw.module._libraw_get_is_foveon(this.lr));
    }
    getRawHeight() {
        return LibRaw.module._libraw_get_raw_height(this.lr);
    }
    getRawWidth() {
        return LibRaw.module._libraw_get_raw_width(this.lr);
    }
    getRawPitch() {
        return LibRaw.module._libraw_get_raw_pitch(this.lr);
    }
    getIHeight() {
        return LibRaw.module._libraw_get_iheight(this.lr);
    }
    getIWidth() {
        return LibRaw.module._libraw_get_iwidth(this.lr);
    }
    getCamMul(index: Int) {
        return LibRaw.module._libraw_get_cam_mul(this.lr, index);
    }
    getPreMul(index: Int) {
        return LibRaw.module._libraw_get_pre_mul(this.lr, index);
    }
    getLeftMargin() {
        return LibRaw.module._libraw_get_left_margin(this.lr);
    }
    getLinearMax(index: Int) {
        return LibRaw.module._libraw_get_linear_max(this.lr, index);
    }
    getPixelAspect() {
        return LibRaw.module._libraw_get_pixel_aspect(this.lr);
    }
    getRightMargin() {
        return LibRaw.module._libraw_get_right_margin(this.lr);
    }
    getTopMargin() {
        return LibRaw.module._libraw_get_top_margin(this.lr);
    }
    getRgbCam(index1: Int, index2: Int) {
        return LibRaw.module._libraw_get_rgb_cam(this.lr, index1, index2);
    }
    getColorMaximum() {
        return LibRaw.module._libraw_get_color_maximum(this.lr);
    }
    getBlack() {
        return LibRaw.module._libraw_get_black(this.lr);
    }
    getCblack(index: Int) {
        return LibRaw.module._libraw_get_cblack(this.lr, index);
    }
    getDataMaximum() {
        return LibRaw.module._libraw_get_data_maximum(this.lr);
    }
    getCamXyz(i: Int, j: Int) {
        return LibRaw.module._libraw_get_cam_xyz(this.lr, i, j);
    }
    setUserMul(index: Int, val: Float) {
        LibRaw.module._libraw_set_user_mul(this.lr, index, val);
    }
    setDemosaic(value: Int) {
        LibRaw.module._libraw_set_demosaic(this.lr, value);
    }
    setAdjustMaximumThr(value: Float) {
        LibRaw.module._libraw_set_adjust_maximum_thr(this.lr, value);
    }
    setOutputColor(value: Int) {
        LibRaw.module._libraw_set_output_color(this.lr, value);
    }
    setHalfSize(value: Int) {
        LibRaw.module._libraw_set_half_size(this.lr, value);
    }
    setUseCameraWb(value: Int) {
        LibRaw.module._libraw_set_use_camera_wb(this.lr, value);
    }
    setOutputBps(value: Int) {
        LibRaw.module._libraw_set_output_bps(this.lr, value);
    }
    setGamma(index: Int, value: Float) {
        LibRaw.module._libraw_set_gamma(this.lr, index, value);
    }
    setNoAutoBright(value: Int) {
        LibRaw.module._libraw_set_no_auto_bright(this.lr, value);
    }
    setBright(value: Float) {
        LibRaw.module._libraw_set_bright(this.lr, value);
    }
    setHighlight(value: Int) {
        LibRaw.module._libraw_set_highlight(this.lr, value);
    }
    setFbddNoiserd(value: Int) {
        LibRaw.module._libraw_set_fbdd_noiserd(this.lr, value);
    }
    static version(): string {
        if (LibRaw.module === undefined) throw new Error("Not initialized");
        const ptr = LibRaw.module._libraw_version();
        return typ
            .sizedCharArrayAsString(Number.POSITIVE_INFINITY)
            .read({ buf: LibRaw.module.HEAPU8, offset: ptr }, {});
    }
    static versionNumber(): number {
        if (LibRaw.module === undefined) throw new Error("Not initialized");
        return LibRaw.module._libraw_versionNumber();
    }
    static cameraCount(): number {
        if (LibRaw.module === undefined) throw new Error("Not initialized");
        return LibRaw.module._libraw_cameraCount();
    }
    static cameraList(): string[] {
        if (LibRaw.module === undefined) throw new Error("Not initialized");
        const ptr = LibRaw.module._libraw_cameraList();
        const length = LibRaw.cameraCount();
        return typ
            .sizedArray(typ.charPointerAsString(), length)
            .read({ buf: LibRaw.module.HEAPU8, offset: ptr }, {});
    }
    unpackFunctionName(): string {
        return this.readString(
            LibRaw.module._libraw_unpack_function_name(this.lr),
        );
    }
    color(row: Int, col: Int): number {
        return LibRaw.module._libraw_COLOR(this.lr, row, col);
    }
    getColor3Image() {
        const ptr = LibRaw.module._libraw_get_color3_image(this.lr);
        return this.readRawPixels(ptr, 3);
    }
    getColor4Image() {
        const ptr = LibRaw.module._libraw_get_color4_image(this.lr);
        return this.readRawPixels(ptr, 4);
    }
    recycle() {
        LibRaw.module._libraw_recycle(this.lr);
        this.releaseInput();
    }
    getRawImage() {
        const ptr = LibRaw.module._libraw_get_raw_image(this.lr);
        return this.readRawPixels(ptr, 1);
    }
    getIParams() {
        return iparams_t.read({
            buf: LibRaw.module.HEAPU8,
            offset: LibRaw.module._libraw_get_iparams(this.lr),
        });
    }
    getLensInfo() {
        return lensinfo_t.read({
            buf: LibRaw.module.HEAPU8,
            offset: LibRaw.module._libraw_get_lensinfo(this.lr),
        });
    }
    getImgOther() {
        return imgother_t.read({
            buf: LibRaw.module.HEAPU8,
            offset: LibRaw.module._libraw_get_imgother(this.lr),
        });
    }
    // getDecoderInfo() {
    // 	/**
    // 	 * @see https://github.com/LibRaw/LibRaw/blob/cccb97647fcee56801fa68231fa8a38aa8b52ef7/libraw/libraw_types.h#L120-L124
    // 	 * ```c
    // 	 * typedef struct {
    // 	 *   const char *decoder_name;
    // 	 *   unsigned decoder_flags;
    // 	 * } libraw_decoder_info_t;
    // 	 * ```
    // 	 */
    // 	const decoderInfoPtr = LibRaw.libraw._malloc(8) as LibRawDecoderInfo;
    // 	const code = LibRaw.libraw._libraw_get_decoder_info(decoderInfoPtr);
    // 	console.log({ code });
    // 	if (code) throw this.error(code);
    // 	const ptr = { ptr: decoderInfoPtr };
    // 	return {
    // 		decoderName: this.readString(this.readU32(ptr) as CharPtr),
    // 		decoderFlags: this.readU32(ptr),
    // 	};
    // }
    getThumbnail() {
        return thumbnail_t.read({
            buf: LibRaw.module.HEAPU8,
            offset: LibRaw.module._libraw_get_thumbnail(this.lr),
        });
    }
    getShootingInfo() {
        return shootinginfo_t.read({
            buf: LibRaw.module.HEAPU8,
            offset: LibRaw.module._libraw_get_shootinginfo(this.lr),
        });
    }
    getMakernotes() {
        return makernotes_t.read({
            buf: LibRaw.module.HEAPU8,
            offset: LibRaw.module._libraw_get_makernotes(this.lr),
        });
    }
    private handleError(code: ErrorCode) {
        if (code) {
            const message = this.readString(
                LibRaw.module._libraw_strerror(code),
            );
            throw new LibRawError(code, message);
        }
    }
    private readString(ptr: CharPtr) {
        if (!ptr) return "";
        return typ
            .sizedCharArrayAsString(Number.POSITIVE_INFINITY)
            .read({ buf: LibRaw.module.HEAPU8, offset: ptr }, {});
    }
    private readI32(ptr: number): number {
        return typ.readI32({ buf: LibRaw.module.HEAPU8, offset: ptr });
    }
    private releaseInput() {
        if (!this.inputPtr) return;
        LibRaw.module._free(this.inputPtr);
        this.inputPtr = 0 as Ptr;
    }
    dispose() {
        if (this._status === "disposed") return;
        LibRaw.module._libraw_close(this.lr);
        this.lr = 0 as LibRawDataT;
        this.releaseInput();
        this._status = "disposed";
    }
    [Symbol.dispose]() {
        this.dispose();
    }
}

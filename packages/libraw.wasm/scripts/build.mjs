import * as child_process from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as url from "node:url";

const cwd = url.fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(cwd, "dist");

const customFunctions = {
	_libraw_get_raw_image: `\
extern "C" DllDef ushort *libraw_get_raw_image(libraw_data_t *lr) {
	if (!lr) return NULL;
	return lr->rawdata.raw_image;
}`,
	_libraw_get_thumbnail: `\
extern "C" DllDef libraw_thumbnail_t *libraw_get_thumbnail(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->thumbnail);
}`,
	_libraw_get_shootinginfo: `\
extern "C" DllDef libraw_shootinginfo_t *libraw_get_shootinginfo(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->shootinginfo);
}`,
	_libraw_get_makernotes: `\
extern "C" DllDef libraw_makernotes_t *libraw_get_makernotes(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes);
}`,
	_libraw_get_canon_makernotes: `\
extern "C" DllDef libraw_canon_makernotes_t *libraw_get_canon_makernotes(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.canon);
}`,
	_libraw_get_nikon_makernotes: `\
extern "C" DllDef libraw_nikon_makernotes_t *libraw_get_nikon_makernotes(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.nikon);
}`,
	_libraw_get_hasselblad_makernotes: `\
extern "C" DllDef libraw_hasselblad_makernotes_t *libraw_get_hasselblad_makernotes(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.hasselblad);
}`,
	_libraw_get_fuji_info: `\
extern "C" DllDef libraw_fuji_info_t *libraw_get_fuji_info(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.fuji);
}`,
	_libraw_get_olympus_makernotes: `\
extern "C" DllDef libraw_olympus_makernotes_t *libraw_get_olympus_makernotes(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.olympus);
}`,
	_libraw_get_sony_info: `\
extern "C" DllDef libraw_sony_info_t *libraw_get_sony_info(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.sony);
}`,
	_libraw_get_kodak_makernotes: `\
extern "C" DllDef libraw_kodak_makernotes_t *libraw_get_kodak_makernotes(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.kodak);
}`,
	_libraw_get_panasonic_makernotes: `\
extern "C" DllDef libraw_panasonic_makernotes_t *libraw_get_panasonic_makernotes(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.panasonic);
}`,
	_libraw_get_pentax_makernotes: `\
extern "C" DllDef libraw_pentax_makernotes_t *libraw_get_pentax_makernotes(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.pentax);
}`,
	_libraw_get_phaseone_makernotes: `\
extern "C" DllDef libraw_p1_makernotes_t *libraw_get_phaseone_makernotes(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.phaseone);
}`,
	_libraw_get_ricoh_makernotes: `\
extern "C" DllDef libraw_ricoh_makernotes_t *libraw_get_ricoh_makernotes(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.ricoh);
}`,
	_libraw_get_samsung_makernotes: `\
extern "C" DllDef libraw_samsung_makernotes_t *libraw_get_samsung_makernotes(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.samsung);
}`,
	_libraw_get_common_metadata: `\
extern "C" DllDef libraw_metadata_common_t *libraw_get_common_metadata(libraw_data_t *lr) {
	if (!lr) return NULL;
	return &(lr->makernotes.common);
}`,
	_libraw_get_black: `\
extern "C" DllDef unsigned libraw_get_black(libraw_data_t *lr) {
	if (!lr) return 0;
	return lr->color.black;
}`,
	_libraw_get_cblack: `\
extern "C" DllDef unsigned libraw_get_cblack(libraw_data_t *lr, int index) {
	if (!lr) return 0;
	if (index < 0 || index >= (int)LIBRAW_CBLACK_SIZE) return 0;
	return lr->color.cblack[index];
}`,
	_libraw_get_data_maximum: `\
extern "C" DllDef unsigned libraw_get_data_maximum(libraw_data_t *lr) {
	if (!lr) return 0;
	return lr->color.data_maximum;
}`,
	_libraw_get_cam_xyz: `\
extern "C" DllDef float libraw_get_cam_xyz(libraw_data_t *lr, int i, int j) {
	if (!lr) return 0.0f;
	if (i < 0 || i >= 4 || j < 0 || j >= 3) return 0.0f;
	return lr->rawdata.color.cam_xyz[i][j];
}`,
    _libraw_get_active_height: `\
extern "C" DllDef int libraw_get_active_height(libraw_data_t *lr) {
    if (!lr) return 0;
    return lr->sizes.height;
}`,
    _libraw_get_active_width: `\
extern "C" DllDef int libraw_get_active_width(libraw_data_t *lr) {
    if (!lr) return 0;
    return lr->sizes.width;
}`,
    _libraw_get_black_level: `\
static unsigned libraw_adjusted_black_level(libraw_data_t *lr, int index) {
    unsigned black = lr->rawdata.color.black;
    unsigned cblack[LIBRAW_CBLACK_SIZE];
    unsigned filters = lr->idata.filters;
    int c;
    int common;

    memcpy(cblack, lr->rawdata.color.cblack, sizeof(cblack));

    if (filters > 1000 && (cblack[4] + 1) / 2 == 1 &&
        (cblack[5] + 1) / 2 == 1) {
        LibRaw *libraw = (LibRaw *)lr->parent_class;
        int colors[4];
        int green_count = 0;
        int last_green = -1;

        for (c = 0; c < 4; c++) {
            colors[c] = libraw->FC(c / 2, c % 2);
            if (colors[c] == 1) {
                green_count++;
                last_green = c;
            }
        }
        if (green_count > 1 && last_green >= 0) colors[last_green] = 3;
        for (c = 0; c < 4; c++) {
            cblack[colors[c]] +=
                cblack[6 + c / 2 % cblack[4] * cblack[5] + c % 2 % cblack[5]];
        }
        cblack[4] = cblack[5] = 0;
    } else if (filters <= 1000 && cblack[4] == 1 && cblack[5] == 1) {
        for (c = 0; c < 4; c++) cblack[c] += cblack[6];
        cblack[4] = cblack[5] = 0;
    }

    common = cblack[3];
    for (c = 0; c < 3; c++) {
        if (common > (int)cblack[c]) common = cblack[c];
    }
    for (c = 0; c < 4; c++) cblack[c] -= common;
    black += common;

    if (cblack[4] && cblack[5]) {
        int nonzero = 0;

        common = cblack[6];
        for (c = 1; c < (int)(cblack[4] * cblack[5]); c++) {
            if (common > (int)cblack[6 + c]) common = cblack[6 + c];
        }
        for (c = 0; c < (int)(cblack[4] * cblack[5]); c++) {
            cblack[6 + c] -= common;
            if (cblack[6 + c]) nonzero++;
        }
        black += common;
        if (!nonzero) cblack[4] = cblack[5] = 0;
    }

    return cblack[index] + black;
}

extern "C" DllDef unsigned libraw_get_black_level(libraw_data_t *lr, int index) {
    if (!lr || index < 0 || index >= 4) return 0;
    return libraw_adjusted_black_level(lr, index);
}`,
    _libraw_get_bottom_margin: `\
extern "C" DllDef int libraw_get_bottom_margin(libraw_data_t *lr) {
    if (!lr) return 0;
    return lr->sizes.raw_height - lr->sizes.height - lr->sizes.top_margin;
}`,
    _libraw_get_cdesc: `\
extern "C" DllDef int libraw_get_cdesc(libraw_data_t *lr, int index) {
    if (!lr || index < 0 || index >= 5) return 0;
    return (unsigned char)lr->idata.cdesc[index];
}`,
    _libraw_get_cmatrix: `\
extern "C" DllDef float libraw_get_cmatrix(libraw_data_t *lr, int i, int j) {
    if (!lr || i < 0 || i >= 3 || j < 0 || j >= 4) return 0.0f;
    return lr->rawdata.color.cmatrix[i][j];
}`,
    _libraw_get_color3_image: `\
extern "C" DllDef ushort *libraw_get_color3_image(libraw_data_t *lr) {
    if (!lr) return NULL;
    return (ushort *)lr->rawdata.color3_image;
}`,
    _libraw_get_color4_image: `\
extern "C" DllDef ushort *libraw_get_color4_image(libraw_data_t *lr) {
    if (!lr) return NULL;
    return (ushort *)lr->rawdata.color4_image;
}`,
    _libraw_get_colors: `\
extern "C" DllDef int libraw_get_colors(libraw_data_t *lr) {
    if (!lr) return 0;
    return lr->idata.colors;
}`,
    _libraw_get_filters: `\
extern "C" DllDef unsigned libraw_get_filters(libraw_data_t *lr) {
    if (!lr) return 0;
    return lr->idata.filters;
}`,
    _libraw_get_flip: `\
extern "C" DllDef int libraw_get_flip(libraw_data_t *lr) {
    if (!lr) return 0;
    return lr->sizes.flip;
}`,
    _libraw_get_is_foveon: `\
extern "C" DllDef unsigned libraw_get_is_foveon(libraw_data_t *lr) {
    if (!lr) return 0;
    return lr->idata.is_foveon;
}`,
    _libraw_get_left_margin: `\
extern "C" DllDef int libraw_get_left_margin(libraw_data_t *lr) {
    if (!lr) return 0;
    return lr->sizes.left_margin;
}`,
    _libraw_get_linear_max: `\
extern "C" DllDef unsigned libraw_get_linear_max(libraw_data_t *lr, int index) {
    if (!lr || index < 0 || index >= 4) return 0;
    return lr->rawdata.color.linear_max[index];
}`,
    _libraw_get_pixel_aspect: `\
extern "C" DllDef double libraw_get_pixel_aspect(libraw_data_t *lr) {
    if (!lr) return 0.0;
    return lr->sizes.pixel_aspect;
}`,
    _libraw_get_raw_pitch: `\
extern "C" DllDef unsigned libraw_get_raw_pitch(libraw_data_t *lr) {
    if (!lr) return 0;
    return lr->sizes.raw_pitch;
}`,
    _libraw_get_right_margin: `\
extern "C" DllDef int libraw_get_right_margin(libraw_data_t *lr) {
    if (!lr) return 0;
    return lr->sizes.raw_width - lr->sizes.width - lr->sizes.left_margin;
}`,
    _libraw_get_top_margin: `\
extern "C" DllDef int libraw_get_top_margin(libraw_data_t *lr) {
    if (!lr) return 0;
    return lr->sizes.top_margin;
}`,
	// Upstream's C API exposes neither of these params; both matter for
	// browser-scale decoding: half_size decodes
	// at half dimensions (~1/4 the memory/time — the difference between
	// a 60MP Phase One fitting in a tab or not), and use_camera_wb
	// applies the shooter's as-shot white balance.
	_libraw_set_half_size: `\
extern "C" DllDef void libraw_set_half_size(libraw_data_t *lr, int value) {
	if (!lr) return;
	lr->params.half_size = value;
}`,
	_libraw_set_use_camera_wb: `\
extern "C" DllDef void libraw_set_use_camera_wb(libraw_data_t *lr, int value) {
	if (!lr) return;
	lr->params.use_camera_wb = value;
}`,
};

async function main() {
	await fs.rm(dist, { recursive: true, force: true });

	const baseMakefile = await fs.readFile(
		path.join(cwd, "LibRaw/Makefile.dist"),
		"utf-8",
	);
	const patchedMakefile = baseMakefile
		.replace(/^all: library all_samples/gim, "")
		.replace(/^CC=gcc/gim, "CC=emcc")
		.replace(/^CXX=g\+\+/gim, "CXX=em++")
		.replace(/^CFLAGS\+=-DUSE_ZLIB/gim, "")
		.replace(/^LDADD\+=-lz/gim, "");
	const exportFunctions = [
		"_libraw_get_raw_height",
		"_libraw_get_raw_width",
		"_libraw_get_iheight",
		"_libraw_get_iwidth",
		"_libraw_get_cam_mul",
		"_libraw_get_pre_mul",
		"_libraw_get_rgb_cam",
		"_libraw_get_iparams",
		"_libraw_get_lensinfo",
		"_libraw_get_imgother",
		"_libraw_get_color_maximum",
		"_libraw_set_user_mul",
		"_libraw_set_demosaic",
		"_libraw_set_adjust_maximum_thr",
		"_libraw_set_output_color",
		"_libraw_set_output_bps",
		"_libraw_set_gamma",
		"_libraw_set_no_auto_bright",
		"_libraw_set_bright",
		"_libraw_set_highlight",
		"_libraw_set_fbdd_noiserd",
		"_libraw_open_buffer",
		"_libraw_init",
		"_libraw_unpack",
		"_libraw_unpack_thumb",
		"_libraw_unpack_thumb_ex",
		"_libraw_raw2image",
		"_libraw_dcraw_process",
		"_libraw_dcraw_make_mem_image",
		"_libraw_dcraw_make_mem_thumb",
		"_libraw_dcraw_clear_mem",
		"_libraw_close",
		"_libraw_version",
		"_libraw_versionNumber",
		// "_libraw_capabilities", // wasm has no any capabilities https://github.com/LibRaw/LibRaw/blob/17294b5fd82bff80463c21386d3847142a37549d/src/utils/utils_libraw.cpp#L193
		"_libraw_cameraCount",
		"_libraw_cameraList",
		"_libraw_get_decoder_info",
		"_libraw_unpack_function_name",
		"_libraw_COLOR",
		"_libraw_subtract_black",
		"_libraw_recycle",
		"_libraw_strerror",
		"_libraw_strprogress",
		// special functions from emscripten
		"_malloc",
		"_free",
		// custom functions
		...Object.keys(customFunctions),
	];
	const makefile = `\
all: lib/libraw.wasm
${patchedMakefile}
CFLAGS+=-DUSE_X3FTOOLS
lib/libraw.wasm: \${LIB_OBJECTS}
	$\{CC} -Os -o lib/libraw.mjs -s MODULARIZE=1 -s EXPORTED_RUNTIME_METHODS=HEAPU8 -s ALLOW_MEMORY_GROWTH=1 -s 'EXPORTED_FUNCTIONS=${JSON.stringify(
		exportFunctions,
	)}' \${LIB_OBJECTS}
`;

	await fs.writeFile(path.join(cwd, "LibRaw/Makefile"), makefile);

	const librawCApiPath = path.join(cwd, "LibRaw/src/libraw_c_api.cpp");
	const librawCApi = await fs.readFile(librawCApiPath, "utf-8");
	await fs.appendFile(
		librawCApiPath,
		Object.values(customFunctions).join("\n"),
	);

	try {
		child_process.execFileSync("make", {
			cwd: path.join(cwd, "LibRaw"),
			stdio: "inherit",
		});
	} catch {}

	await fs.rm(path.join(cwd, "LibRaw/Makefile"));
	await fs.writeFile(librawCApiPath, librawCApi);

	// move files to dist
	await fs.mkdir(dist).catch(() => {});
	const outfiles = ["libraw.mjs", "libraw.wasm"];
	for (const outfile of outfiles) {
		await fs.rename(
			path.join(cwd, "LibRaw/lib", outfile),
			path.join(dist, outfile),
		);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as url from "node:url";

const packageRoot = url.fileURLToPath(new URL("../", import.meta.url));
const repoRoot = path.resolve(packageRoot, "../..");
const requiredFiles = [
    "CHANGELOG.md",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/libraw.mjs",
    "dist/libraw.wasm",
    "LibRaw/COPYRIGHT",
    "LibRaw/LICENSE.CDDL",
    "LibRaw/LICENSE.LGPL",
    "LICENSE",
    "README.md",
];
const shippedFiles = [
    "CHANGELOG.md",
    "dist",
    "LibRaw/COPYRIGHT",
    "LibRaw/LICENSE.CDDL",
    "LibRaw/LICENSE.LGPL",
];

const packageJson = JSON.parse(
    await fs.readFile(path.join(packageRoot, "package.json"), "utf8"),
);

assert.deepEqual(packageJson.bugs, {
    url: "https://github.com/colorhythm/libraw-wasm/issues",
});
assert.deepEqual(packageJson.files, shippedFiles);
assert.equal(
    packageJson.homepage,
    "https://github.com/colorhythm/libraw-wasm#readme",
);
assert.equal(packageJson.name, "@colorhythm/libraw-wasm");
assert.deepEqual(packageJson.publishConfig, {
    access: "public",
});
assert.deepEqual(packageJson.repository, {
    directory: "packages/libraw.wasm",
    type: "git",
    url: "git+https://github.com/colorhythm/libraw-wasm.git",
});

await Promise.all(
    requiredFiles.map((file) => fs.access(path.join(packageRoot, file))),
);

const [packageReadme, repoReadme] = await Promise.all([
    fs.readFile(path.join(packageRoot, "README.md")),
    fs.readFile(path.join(repoRoot, "README.md")),
]);
assert.deepEqual(
    packageReadme,
    repoReadme,
    "Repository and package README files must be identical",
);

console.log("Package metadata and required files are ready for packing.");

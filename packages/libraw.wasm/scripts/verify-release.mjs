import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as url from "node:url";

const packageRoot = url.fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(
    await fs.readFile(path.join(packageRoot, "package.json"), "utf8"),
);
const releaseTag = process.env.GITHUB_REF_NAME ?? process.argv[2];

assert.ok(releaseTag, "Pass a release tag or set GITHUB_REF_NAME");
assert.equal(
    releaseTag,
    `v${packageJson.version}`,
    `Release tag ${releaseTag} does not match package version ${packageJson.version}`,
);

console.log(
    `${packageJson.name} ${packageJson.version} matches release tag ${releaseTag}.`,
);

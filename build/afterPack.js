const fs = require("node:fs/promises");
const path = require("node:path");

function normalizeArch(arch) {
  if (typeof arch === "string") {
    return arch;
  }

  switch (arch) {
    case 1:
      return "x64";
    case 3:
      return "arm64";
    case 5:
      return "universal";
    default:
      return String(arch);
  }
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveMacAppBundleDir(appOutDir) {
  const entries = await fs.readdir(appOutDir, { withFileTypes: true });
  const appBundle = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
  return appBundle ? path.join(appOutDir, appBundle.name) : null;
}

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const arch = normalizeArch(context.arch);

  if (platform !== "darwin" || (arch !== "x64" && arch !== "arm64")) {
    return;
  }

  const appOutDir = context.appOutDir;
  if (!appOutDir) {
    console.warn("[afterPack] Missing appOutDir, skip pruning sharp binaries.");
    return;
  }

  const appBundleDir = await resolveMacAppBundleDir(appOutDir);
  if (!appBundleDir) {
    console.warn(`[afterPack] No .app bundle found in ${appOutDir}, skip pruning.`);
    return;
  }

  const unpackedImgDir = path.join(
    appBundleDir,
    "Contents",
    "Resources",
    "app.asar.unpacked",
    "node_modules",
    "@img",
  );

  if (!(await exists(unpackedImgDir))) {
    console.log("[afterPack] No unpacked @img directory found, skip pruning.");
    return;
  }

  const oppositeArch = arch === "x64" ? "arm64" : "x64";
  const packagesToRemove = [
    `sharp-darwin-${oppositeArch}`,
    `sharp-libvips-darwin-${oppositeArch}`,
  ];

  let removedAny = false;
  for (const packageName of packagesToRemove) {
    const packageDir = path.join(unpackedImgDir, packageName);
    if (!(await exists(packageDir))) {
      continue;
    }

    await fs.rm(packageDir, { recursive: true, force: true });
    removedAny = true;
  }

  if (removedAny) {
    console.log(`[afterPack] Pruned sharp ${oppositeArch} binaries from darwin-${arch} build.`);
  }
};

#!/usr/bin/env bash
set -euo pipefail

: "${CSC_LINK:?Missing signing certificate}"
: "${CSC_KEY_PASSWORD:?Missing signing certificate password}"
: "${APPLE_ID:?Missing Apple ID}"
: "${APPLE_APP_SPECIFIC_PASSWORD:?Missing Apple app-specific password}"
: "${APPLE_TEAM_ID:?Missing Apple team ID}"

case "$(uname -m)" in
  x86_64) arch=x64; build_script=build:mac:intel ;;
  arm64) arch=arm64; build_script=build:mac:arm64 ;;
  *) echo 'Unsupported macOS runner architecture' >&2; exit 1 ;;
esac

# Fetch dmg-builder from GitHub when the npm mirror is behind.
sed -i.bak '/electron_builder_binaries_mirror/d' .npmrc
export npm_config_electron_builder_binaries_mirror='https://github.com/electron-userland/electron-builder-binaries/releases/download/'
export ELECTRON_BUILDER_BINARIES_MIRROR="$npm_config_electron_builder_binaries_mirror"
export ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL="${ELECTRON_BUILDER_BINARIES_MIRROR}dmg-builder@1.2.0"
unset npm_package_config_electron_builder_binaries_mirror
yarn run "$build_script" --config.forceCodeSigning=true

shopt -s nullglob
apps=(dist/mac*/*.app)
if [ "${#apps[@]}" -ne 1 ]; then
  echo 'Expected one packaged macOS application' >&2
  exit 1
fi
app="${apps[0]}"
codesign --verify --deep --strict --verbose=2 "$app"
signature="$(codesign -d --verbose=4 "$app" 2>&1)"
grep -q '^Authority=Developer ID Application:' <<< "$signature"
grep -Fxq "TeamIdentifier=$APPLE_TEAM_ID" <<< "$signature"
xcrun stapler validate "$app"
echo "Verified Developer ID signature and stapled notarization for $arch"

mv dist/latest-mac.yml "dist/latest-mac-$arch.yml"

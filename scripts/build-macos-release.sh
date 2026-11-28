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

# Electron Builder 26.8.1 passes the PKCS#12 password to set-key-partition-list.
# Import into our own keychain and give the builder that keychain directly.
signing_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ceru-signing.XXXXXXXX")"
export CSC_KEYCHAIN="$signing_dir/signing.keychain-db"
certificate="$signing_dir/developer-id.p12"
keychain_password="$(openssl rand -hex 32)"
echo "::add-mask::$keychain_password"
keychains=()
while IFS= read -r keychain; do
  keychain="${keychain#*\"}"
  keychains+=("${keychain%\"}")
done < <(security list-keychains -d user)

cleanup() {
  security list-keychains -d user -s "${keychains[@]}" || true
  security delete-keychain "$CSC_KEYCHAIN" || true
  rm -f -- "$certificate"
  rmdir "$signing_dir" || true
}
trap cleanup EXIT

printf '%s' "$CSC_LINK" | base64 -D > "$certificate"
security create-keychain -p "$keychain_password" "$CSC_KEYCHAIN"
security set-keychain-settings -lut 21600 "$CSC_KEYCHAIN"
security unlock-keychain -p "$keychain_password" "$CSC_KEYCHAIN"
security import "$certificate" -k "$CSC_KEYCHAIN" -f pkcs12 -P "$CSC_KEY_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$CSC_KEYCHAIN" >/dev/null
security list-keychains -d user -s "$CSC_KEYCHAIN" "${keychains[@]}"
security find-identity -v -p codesigning "$CSC_KEYCHAIN" | grep -F 'Developer ID Application:'
rm -f -- "$certificate"
unset CSC_LINK CSC_KEY_PASSWORD

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

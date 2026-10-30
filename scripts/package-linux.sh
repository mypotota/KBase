#!/usr/bin/env sh
set -eu
binary=${1:-web/src-tauri/target/release/kbase}
output=${2:-dist-desktop}
[ -x "$binary" ] || { echo 'Build the Linux release binary first.' >&2; exit 1; }
command -v dpkg-deb >/dev/null
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT HUP INT TERM
mkdir -p "$stage/DEBIAN" "$stage/usr/bin" "$stage/usr/share/doc/kbase" "$stage/usr/share/applications" "$stage/usr/share/icons/hicolor/128x128/apps" "$output"
cp "$binary" "$stage/usr/bin/kbase"
chmod 755 "$stage/usr/bin/kbase"
cp web/SHADCN-LICENSE "$stage/usr/share/doc/kbase/SHADCN-LICENSE"
cp web/src-tauri/icons/128x128.png "$stage/usr/share/icons/hicolor/128x128/apps/kbase.png"
cat > "$stage/DEBIAN/control" <<'CONTROL'
Package: kbase
Version: 0.1.0
Architecture: amd64
Maintainer: KBase contributors
Section: editors
Priority: optional
Depends: libc6 (>= 2.36), libgcc-s1, libstdc++6, libwebkit2gtk-4.1-0 (>= 2.40), libgtk-3-0, xdg-utils
Description: Local Markdown knowledge base
 Organize local folders and edit standard Markdown documents.
CONTROL
cat > "$stage/usr/share/applications/kbase.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=KBase
Comment=Local Markdown knowledge base
Exec=kbase
Icon=kbase
Terminal=false
Categories=Office;TextEditor;
StartupWMClass=KBase
DESKTOP
chmod -R u+rwX,go+rX "$stage"
dpkg-deb --root-owner-group --build "$stage" "$output/kbase_0.1.0_amd64.deb"

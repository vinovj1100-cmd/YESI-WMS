# YESI-FULFILLMENT Build Guide

This guide covers building the YESI-FULFILLMENT Warehouse Management System as a standalone application for **Windows**, **Android**, and **iOS** using Tauri v2.

## Project Structure

- **Web App**: React + Vite + TypeScript + Tailwind CSS + Dexie (IndexedDB)
- **Desktop**: Tauri v2 (Rust + WebView2)
- **Mobile**: Tauri v2 supports Android and iOS builds from the same codebase

---

## Prerequisites

### All Platforms
- **Node.js** 20+ and npm
- **Rust** (install via [rustup](https://rustup.rs/))

### Windows Desktop
- One of:
  - **Visual Studio 2022** with "Desktop development with C++" workload, OR
  - **Visual Studio Build Tools 2022** with the same workload, OR
  - **MinGW-w64** (already bundled for this project via GNU toolchain)

### Android
- **Android Studio** with Android SDK + NDK
- **Java** JDK 17+

### iOS
- **macOS** with Xcode 14+

---

## Quick Start

```bash
# Install dependencies
npm install

# Run development server (web + desktop)
npm run tauri:dev

# Build for production web
npm run build

# Build Windows installer + portable
npm run tauri:build
```

---

## Windows Build

### Option A: Using MSVC (Recommended)

1. Install **Visual Studio Build Tools** or **Visual Studio Community**:
   ```
   https://visualstudio.microsoft.com/downloads/
   ```
   Select the **"Desktop development with C++"** workload.

2. Switch Rust to MSVC toolchain:
   ```bash
   rustup default stable-x86_64-pc-windows-msvc
   ```

3. Build:
   ```bash
   npm run tauri:build
   ```

### Option B: Using MinGW-w64 (GNU Toolchain)

This project includes MinGW-w64 for environments without Visual Studio.

1. Ensure MinGW bin is in PATH:
   ```bash
   set PATH=%CD%\mingw64\mingw64\bin;%PATH%
   ```

2. Switch Rust to GNU toolchain:
   ```bash
   rustup default stable-x86_64-pc-windows-gnu
   ```

3. The project already has `.cargo/config.toml` configured to use MinGW.

4. Build:
   ```bash
   npm run tauri:build
   ```

### Output Files

After a successful build, find your installers in:

```
src-tauri/target/release/bundle/
├── msi/
│   └── YESI-FULFILLMENT_1.0.0_x64_en-US.msi    ← Windows Installer
├── nsis/
│   └── YESI-FULFILLMENT_1.0.0_x64-setup.exe   ← Portable Installer
└── (target arch)/release/
    └── yesi-fulfillment.exe                   ← Standalone executable
```

---

## Android Build

### 1. Install Prerequisites

```bash
# Install Android SDK via Android Studio, then configure:
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android

# Set environment variables (adjust paths to your Android SDK)
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set NDK_HOME=%ANDROID_HOME%\ndk\25.2.9519653
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
```

### 2. Initialize Android Project

```bash
npm run tauri android init
```

### 3. Build APK / AAB

```bash
# Debug APK
npm run tauri android build

# Release APK
npm run tauri android build -- --release

# Release AAB (for Google Play)
npm run tauri android build -- --release --aab
```

### Output Files

```
src-tauri/gen/android/app/build/outputs/
├── apk/
│   └── release/
│       └── app-release.apk
└── bundle/
    └── release/
        └── app-release.aab
```

---

## iOS Build

### 1. Prerequisites

- macOS machine with Xcode 14+ installed
- Apple Developer account (for signing)

### 2. Install Targets

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
```

### 3. Initialize iOS Project

```bash
npm run tauri ios init
```

### 4. Build

```bash
# Simulator
npm run tauri ios build -- --target aarch64-apple-ios-sim

# Device (requires signing certificate)
npm run tauri ios build -- --target aarch64-apple-ios
```

### Output Files

```
src-tauri/gen/ios/build/
```

Open the generated `.xcodeproj` in Xcode to sign, archive, and distribute.

---

## PWA (Mobile Web)

The app is also a fully functional Progressive Web App:

1. **Install on mobile**: Visit the hosted URL in Chrome/Safari and tap "Add to Home Screen"
2. **Works offline**: Dexie (IndexedDB) stores all data locally
3. **Icons**: PWA icons are generated in `public/` (192x192 and 512x512)

To deploy the PWA:

```bash
npm run build
# Upload the `dist/` folder to any static web host
```

---

## Native Features Enabled

The Tauri build includes these native plugins:

| Plugin | Capability |
|--------|-----------|
| `tauri-plugin-dialog` | Native file open/save dialogs |
| `tauri-plugin-fs` | Read/write files to disk |
| `tauri-plugin-clipboard-manager` | Copy/paste from system clipboard |
| `tauri-plugin-shell` | Open external URLs |
| `tauri-plugin-log` | Native logging |

---

## Troubleshooting

### `link.exe` not found (Windows MSVC)
Install Visual Studio Build Tools with the C++ workload.

### `dlltool` errors (Windows GNU)
Ensure MinGW-w64 `bin` directory is in your PATH before building.

### Vite PWA build fails with file size error
The `maximumFileSizeToCacheInBytes` is already configured in `vite.config.ts` to 5MB.

### Android build fails with NDK not found
Set `NDK_HOME` environment variable to your Android NDK path.

---

## Distribution Checklist

- [ ] Windows: `YESI-FULFILLMENT_1.0.0_x64-setup.exe` (NSIS installer)
- [ ] Windows: `YESI-FULFILLMENT_1.0.0_x64_en-US.msi` (MSI installer)
- [ ] Android: `app-release.apk` (side-load) or `app-release.aab` (Play Store)
- [ ] iOS: Archive via Xcode + App Store Connect
- [ ] Web/PWA: Upload `dist/` folder to static hosting

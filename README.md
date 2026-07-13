# YESI-FULFILLMENT

**Modern Warehouse Management System** — built as a standalone desktop app (Windows), mobile app (Android/iOS), and Progressive Web App.

Built with **React + Vite + TypeScript + Tailwind CSS + Dexie** (offline-first IndexedDB). Packaged as a native app with **Tauri v2**.

---

## Features

- **Offline-first** — All data stored locally via IndexedDB (Dexie)
- **Cross-platform** — Windows desktop app + Android/iOS mobile + PWA
- **Mobile responsive** — Collapsible sidebar, touch-friendly UI
- **Barcode scanning** — PDF label sequencing with tracking ID extraction
- **Inventory management** — Inbound receiving, stock tracking, cycle counts
- **Order fulfillment** — Pick & pack, wave batching, QC management
- **Analytics** — Dashboard KPIs, fulfillment rates, low stock alerts
- **SIM manager** — IMEI/TAC prefix database for mobile device inventory
- **User roles** — Admin, Supervisor, Operator with session timeout

---

## Quick Start

```bash
# Install dependencies
npm install

# Run dev server (web + desktop)
npm run dev

# Build for production
npm run build

# Build Windows installer
npm run tauri:build
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, TypeScript 5.9 |
| Styling | Tailwind CSS 3.4, shadcn/ui components |
| State | React Hooks + Dexie (IndexedDB) |
| Animations | Framer Motion |
| 3D Background | React Three Fiber + Drei |
| Desktop | Tauri v2 (Rust + WebView2) |
| PWA | vite-plugin-pwa |

---

## Build Outputs

See `BUILD.md` for detailed platform-specific instructions.

| Platform | Output |
|----------|--------|
| Windows | `releases/YESI-FULFILLMENT_1.0.0_x64-setup.exe` |
| Windows | `releases/YESI-FULFILLMENT_1.0.0_x64_en-US.msi` |
| Windows | `releases/yesi-fulfillment.exe` (portable) |
| Android | `src-tauri/gen/android/app/build/outputs/apk/release/app-release.apk` |
| iOS | `src-tauri/gen/ios/build/` (Xcode archive) |
| Web/PWA | `dist/` folder for static hosting |

---

## Default Login

| Username | Password | Role |
|----------|----------|------|
| `VINOVJ` | `VINOVJ` | Admin |
| `operator` | `operator` | Operator |
| `supervisor` | `supervisor` | Supervisor |

---

## Project Structure

```
├── src/                          # React frontend
│   ├── components/               # UI components (Sidebar, TopBar, Layout, etc.)
│   ├── pages/                    # Route pages (Dashboard, Inventory, PickPack, etc.)
│   ├── lib/                      # Database (Dexie), auth, utilities
│   └── hooks/                    # Custom React hooks
├── src-tauri/                    # Tauri desktop/mobile wrapper
│   ├── src/                      # Rust backend (main.rs, lib.rs)
│   ├── icons/                    # App icons for all platforms
│   ├── capabilities/             # Native permissions
│   └── tauri.conf.json           # Tauri configuration
├── public/                       # Static assets (PWA icons)
├── dist/                         # Production web build
├── releases/                     # Built Windows installers
├── BUILD.md                      # Detailed build guide
└── vite.config.ts                # Vite + PWA configuration
```

---

## License

MIT — YESI-FZCO

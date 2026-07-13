#!/usr/bin/env python3
"""Generate YESI-FULFILLMENT / Vortex WMS Master Catalog PDF."""

from fpdf import FPDF
from datetime import date
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "docs")
OUT_PATH = os.path.join(OUT_DIR, "YESI-FULFILLMENT-Master-Catalog.pdf")


def ascii_safe(text: str) -> str:
    """Ensure text is latin-1 safe for core FPDF fonts."""
    replacements = {
        "\u2014": "-", "\u2013": "-", "\u2192": "->", "\u2022": "*",
        "\u2191": "^", "\u2193": "v", "\u21b5": "Enter",
        "\u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435": "otpravlenie",
        "\u0430\u0440\u0442\u0438\u043a\u0443\u043b": "artikul",
        "\u043a\u043e\u0434 \u0442\u043e\u0432\u0430\u0440\u0430": "kod tovara",
        "\u0442\u043e\u0432\u0430\u0440": "tovar",
        "\u043d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435": "naimenovanie",
        "\u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e": "kolichestvo",
        "\u0441\u0442\u0430\u0442\u0443\u0441": "status (RU)",
        "\u0442\u0440\u0435\u043a": "trek",
        "\u0433\u043e\u0440\u043e\u0434": "gorod",
        "\u0441\u043a\u043b\u0430\u0434": "sklad",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text.encode("latin-1", errors="replace").decode("latin-1")


class CatalogPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(100, 100, 100)
            self.cell(0, 8, "YESI-FULFILLMENT / Vortex WMS - Master Catalog", align="L")
            self.cell(0, 8, f"Page {self.page_no()}", align="R")
            self.ln()
            self.set_draw_color(200, 200, 200)
            self.line(10, 16, 200, 16)
            self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Generated {date.today().isoformat()} | YESI-FZCO Warehouse Operations", align="C")

    def section_title(self, num: str, title: str):
        self.add_page()
        self.set_font("Helvetica", "B", 18)
        self.set_text_color(20, 80, 160)
        self.cell(0, 12, f"{num}. {title}")
        self.ln()
        self.set_draw_color(20, 80, 160)
        self.line(10, self.get_y(), 80, self.get_y())
        self.ln(6)

    def subsection(self, title: str):
        self.ln(2)
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(40, 40, 40)
        self.cell(0, 8, title)
        self.ln()
        self.ln(2)

    def body(self, text: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, ascii_safe(text))
        self.ln(2)

    def bullet(self, text: str, indent: int = 0):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        x = 10 + indent
        self.set_x(x)
        self.multi_cell(0, 5.5, ascii_safe(f"  - {text}"))

    def code_line(self, text: str):
        self.set_font("Courier", "", 9)
        self.set_text_color(60, 60, 60)
        self.set_fill_color(245, 245, 245)
        self.cell(0, 6, ascii_safe(f"  {text}"), fill=True)
        self.ln()

    def table_row(self, cols: list, widths: list, bold=False):
        self.set_font("Helvetica", "B" if bold else "", 9)
        for i, (col, w) in enumerate(zip(cols, widths)):
            self.cell(w, 7, ascii_safe(str(col)[:40]), border=1)
        self.ln()


def build_pdf():
    os.makedirs(OUT_DIR, exist_ok=True)
    pdf = CatalogPDF()
    pdf.set_auto_page_break(auto=True, margin=20)

    # ── COVER ──
    pdf.add_page()
    pdf.ln(40)
    pdf.set_font("Helvetica", "B", 28)
    pdf.set_text_color(20, 80, 160)
    pdf.cell(0, 15, "YESI-FULFILLMENT", align="C")
    pdf.ln()
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(50, 50, 50)
    pdf.cell(0, 12, "Vortex WMS Master Catalog", align="C")
    pdf.ln()
    pdf.ln(8)
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 10, "Complete Workflows, Functions & Tips", align="C")
    pdf.ln()
    pdf.ln(20)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, "Ozon Fulfillment | Google Sheets | Inventory | Multi-Device", align="C")
    pdf.ln()
    pdf.cell(0, 8, f"Version 1.0  |  {date.today().strftime('%B %d, %Y')}", align="C")
    pdf.ln()
    pdf.ln(30)
    pdf.set_font("Helvetica", "I", 10)
    pdf.cell(0, 8, "Project: warehouse_ops_pro/app", align="C")
    pdf.ln()
    pdf.cell(0, 8, "Stack: React 19 + Vite + Dexie + PWA + Tauri", align="C")
    pdf.ln()

    # ── TOC ──
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(20, 80, 160)
    pdf.cell(0, 12, "Table of Contents")
    pdf.ln()
    pdf.ln(4)
    toc = [
        "1.  Quick Start & Installation",
        "2.  Login, Roles & Security",
        "3.  Navigation & Keyboard Shortcuts",
        "4.  Dashboard & Notifications",
        "5.  Ozon Google Sheets Pipeline (Complete)",
        "6.  Inbound Receiving Workflow",
        "7.  Putaway Management",
        "8.  Pick & Pack Workflow",
        "9.  Batch Pick Center",
        "10. Inventory Hub",
        "11. Serial Tracking & IMEI",
        "12. Shipping & Carrier Rates",
        "13. Posting Tracker (Ozon Proof)",
        "14. PDF Sequencer & Label Tools",
        "15. Returns Processing",
        "16. Cycle Count & Replenishment",
        "17. QC Management",
        "18. Dock & Yard Management",
        "19. Labor Management",
        "20. Analytics & KPIs",
        "21. Integrations Hub",
        "22. Guardian Ops & Pressure Monitor",
        "23. Vortex AI Assistant",
        "24. Manual Order Tools",
        "25. Administration",
        "26. Database Schema (All 34 Tables)",
        "27. Library Functions Reference",
        "28. Automation & Multi-Device",
        "29. PWA, Offline & Desktop (Tauri)",
        "30. Tips, Tricks & Troubleshooting",
        "31. Daily Warehouse Playbooks",
    ]
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(30, 30, 30)
    for line in toc:
        pdf.cell(0, 7, line)
        pdf.ln()

    # ── 1. QUICK START ──
    pdf.section_title("1", "Quick Start & Installation")
    pdf.subsection("Prerequisites")
    pdf.bullet("Node.js 18+ and npm")
    pdf.bullet("Modern browser (Chrome, Edge, Firefox) or Windows for Tauri desktop")
    pdf.subsection("Install & Run (Web)")
    pdf.code_line("cd warehouse_ops_pro/app")
    pdf.code_line("npm install")
    pdf.code_line("npm run dev          # http://localhost:3000")
    pdf.code_line("npm run build        # Production PWA build")
    pdf.code_line("npm run preview      # http://localhost:4173")
    pdf.subsection("Desktop App (Tauri)")
    pdf.code_line("npm run tauri:dev    # Native Windows shell")
    pdf.code_line("npm run tauri:build  # .exe / .msi installer")
    pdf.subsection("First Login")
    pdf.bullet("Admin: VINOVJ / VINOVJ (full access)")
    pdf.bullet("Operator: operator / operator")
    pdf.bullet("Supervisor: supervisor / supervisor")
    pdf.body("On first launch, seedDatabase() populates inventory, orders, zones, Ozon sheet config, and integration endpoints automatically.")

    # ── 2. AUTH ──
    pdf.section_title("2", "Login, Roles & Security")
    pdf.subsection("Roles")
    w = [45, 145]
    pdf.table_row(["Role", "Access"], w, bold=True)
    pdf.table_row(["admin", "All pages + User Mgmt, SIM, Guardian, Admin settings"], w)
    pdf.table_row(["supervisor", "All operational pages, no admin section"], w)
    pdf.table_row(["operator", "Standard warehouse tasks, no admin section"], w)
    pdf.subsection("Session Security")
    pdf.bullet("30-minute inactivity timeout (auto logout)")
    pdf.bullet("Session stored in localStorage key: vortex_session")
    pdf.bullet("All login/logout events logged to auditLogs table")
    pdf.bullet("Admin-only: Google API keys, auto-sync config, user CRUD")

    # ── 3. NAVIGATION ──
    pdf.section_title("3", "Navigation & Keyboard Shortcuts")
    pdf.subsection("Global Shortcuts")
    pdf.table_row(["Shortcut", "Action"], [50, 140], bold=True)
    pdf.table_row(["Ctrl/Cmd + K", "Open Command Palette (fuzzy search all pages)"], [50, 140])
    pdf.table_row(["Escape", "Close Command Palette / modals"], [50, 140])
    pdf.table_row(["Up / Down", "Navigate palette items"], [50, 140])
    pdf.table_row(["Enter", "Select palette item / submit barcode scan"], [50, 140])
    pdf.subsection("Sidebar Structure (4 Tiers)")
    pdf.bullet("Operations: Dashboard, Inbound, Putaway, Pick&Pack, Batch Pick, Returns, Shipping, Dock, Posting, Ozon Sheets")
    pdf.bullet("Advanced: Inventory, Serial, Cycle Count, Replenishment, Labor, Analytics, QC, Integrations, Memory, Scanner")
    pdf.bullet("Manual Orders: PDF Sequencer, Templates, Bulk Converter, Auditor")
    pdf.bullet("Administration (admin only): Users, SIM Manager, Guardian, Vortex AI, Barcode Generator")

    # ── 4. DASHBOARD ──
    pdf.section_title("4", "Dashboard & Notifications")
    pdf.body("Route: /  |  Real-time KPIs with auto-refresh (configurable in Settings).")
    pdf.subsection("KPI Cards")
    pdf.bullet("Total stock, low-stock count, pending orders, shipped today")
    pdf.bullet("Returns, QC holds, cycle count pending, wave batches active")
    pdf.bullet("Posting count, worker tasks, fulfillment rate")
    pdf.subsection("Notification Bell (TopBar)")
    pdf.bullet("Unread count badge; click to open alert panel")
    pdf.bullet("Sources: Ozon sheet sync, low stock, high order volume, Guardian pressure")
    pdf.bullet("Types: success, warning, error, info — persisted in Zustand store")
    pdf.subsection("Sync Status Indicator")
    pdf.bullet("ONLINE - SYNCED (green) when connected")
    pdf.bullet("OFFLINE - LOCAL MODE (red banner) — all data still works via IndexedDB")

    # ── 5. OZON SHEETS ──
    pdf.section_title("5", "Ozon Google Sheets Pipeline (Complete)")
    pdf.body("Route: /ozon-sheets  |  The core Ozon fulfillment integration.")
    pdf.subsection("Pre-Configured Sheet")
    pdf.code_line("ID: 1NNSAHZ8A7l2nDbWZ-9tLE6K5lmDWo7V6MBizbhH875o")
    pdf.code_line("GID: 1858822101")
    pdf.subsection("Pipeline Flow")
    pdf.body("Google Sheet -> Column Mapper -> WMS Orders -> Inventory -> Pick & Pack -> Posting Tracker")
    pdf.subsection("Three Sync Methods")
    pdf.bullet("LIVE URL (gviz CSV): Sheet must be published 'Anyone with link -> Viewer'")
    pdf.bullet("API KEY: Google Sheets API v4 — works with private sheets (admin sets key)")
    pdf.bullet("CSV UPLOAD: File -> Download -> CSV from Google Sheets — always works offline")
    pdf.subsection("Column Auto-Mapping (RU/EN)")
    pdf.bullet("orderId: order id, posting, отправление, shipment")
    pdf.bullet("sku: sku, артикул, article, код товара")
    pdf.bullet("product: product, товар, наименование")
    pdf.bullet("quantity: qty, количество, count")
    pdf.bullet("status: status, статус, fulfillment")
    pdf.bullet("tracking: tracking, трек, ozon id")
    pdf.bullet("city: city, город, склад")
    pdf.subsection("Sync Behavior (runSheetSync)")
    pdf.bullet("Upserts orders into db.orders (import new, update existing)")
    pdf.bullet("Creates inventory stubs for unknown SKUs at OZON-PENDING location")
    pdf.bullet("Dedup via sheetSyncRows.rowHash when skipDuplicates enabled")
    pdf.bullet("Optional autoAllocatePendingOrders() for FEFO/FIFO reservations")
    pdf.bullet("Logs every sync to sheetSyncLogs with device ID and duration")
    pdf.subsection("Automation (ozonAutomation.ts)")
    pdf.bullet("Runs every 5 min from Layout on login")
    pdf.bullet("Auto-syncs sheets where autoSync=1 and interval elapsed")
    pdf.bullet("Low-stock alerts when stock <= reorderPoint")
    pdf.bullet("High volume alert when pending orders > 20")
    pdf.bullet("Guardian critical pressure notifications")
    pdf.subsection("Admin Settings")
    pdf.bullet("Sheet URL, fetch method (auto/gviz/api), sync interval (5-120 min)")
    pdf.bullet("Toggles: auto-sync, auto-allocate, skip duplicates")
    pdf.bullet("Google API key (password field, admin only)")
    pdf.subsection("Multi-Device")
    pdf.bullet("Each browser gets unique device ID (localStorage vortex_device_id)")
    pdf.bullet("Heartbeat every 60s registers operator + platform in connectedDevices")
    pdf.bullet("Online = last seen within 5 minutes")

    # ── 6. INBOUND ──
    pdf.section_title("6", "Inbound Receiving Workflow")
    pdf.body("Route: /inbound  |  Three receiving modes.")
    pdf.subsection("Manual Receive")
    pdf.bullet("Scan/enter SKU, quantity, bin location, lot number, expiry date")
    pdf.bullet("Optional cross-dock order ID for direct-to-ship")
    pdf.bullet("QC mode: pending / passed / failed")
    pdf.bullet("Creates inbound record + updates inventory + inventoryMovement")
    pdf.subsection("Excel Upload")
    pdf.bullet("Upload .xlsx, map columns, preview rows, bulk commit")
    pdf.bullet("Uses xlsx library for parsing")
    pdf.subsection("PO Reconciliation")
    pdf.bullet("Match received qty against purchaseOrders")
    pdf.bullet("Variance tracking, supplier info, putaway suggestions")
    pdf.subsection("G-Sheets Link Rack")
    pdf.bullet("Bookmark Google Sheet URLs in localStorage for quick access")

    # ── 7. PUTAWAY ──
    pdf.section_title("7", "Putaway Management")
    pdf.body("Route: /putaway  |  Directed putaway task queue.")
    pdf.subsection("Task Lifecycle")
    pdf.body("pending -> assigned -> in_progress -> completed (or cancelled)")
    pdf.subsection("Source Types")
    pdf.bullet("receiving, returns, transfer, qc_release, cross_dock")
    pdf.subsection("Putaway Methods")
    pdf.bullet("direct: SKU to specific bin")
    pdf.bullet("zone: zone-level placement")
    pdf.bullet("cross_dock: bypass storage to outbound")
    pdf.bullet("consolidation: merge into existing location")
    pdf.subsection("Performance Tracking")
    pdf.bullet("Estimated vs actual time, distance walked, QC status per task")

    # ── 8. PICK PACK ──
    pdf.section_title("8", "Pick & Pack Workflow")
    pdf.body("Route: /pick-pack  |  Core order fulfillment.")
    pdf.subsection("Standard Pick")
    pdf.bullet("1. Select pending order from queue (sorted by priority)")
    pdf.bullet("2. Scan each required SKU (barcode wedge or manual)")
    pdf.bullet("3. System decrements inventory, logs pick movement")
    pdf.bullet("4. Mark order Shipped when all SKUs confirmed")
    pdf.subsection("Wave Pick Mode")
    pdf.bullet("Aggregate SKUs across multiple orders")
    pdf.bullet("Single pass through warehouse for shared items")
    pdf.subsection("Order Statuses")
    pdf.body("Pending, Picking, Packed, ReadyToShip, Shipped, Returned, Cancelled, QCHold, CrossDock")
    pdf.subsection("Priority Levels")
    pdf.bullet("urgent (red) — express Ozon orders")
    pdf.bullet("high (yellow) — picking in progress or high priority sheet flag")
    pdf.bullet("normal (default)")

    # ── 9. BATCH PICK ──
    pdf.section_title("9", "Batch Pick Center")
    pdf.body("Route: /batch-pick  |  Advanced multi-order picking.")
    pdf.subsection("Workflow")
    pdf.bullet("1. Select multiple pending orders")
    pdf.bullet("2. optimizePickPath() — nearest-neighbor TSP route")
    pdf.bullet("3. createBatchGroup() — batch ID with pick path JSON")
    pdf.bullet("4. Optional autoAllocatePendingOrders() for FEFO reservations")
    pdf.subsection("Pick Path Optimizer")
    pdf.bullet("Calculates total distance, estimated time, zone profile")
    pdf.bullet("Stores route in pickPaths and batchGroups tables")

    # ── 10. INVENTORY ──
    pdf.section_title("10", "Inventory Hub")
    pdf.body("Route: /inventory  |  Full stock management.")
    pdf.subsection("Features")
    pdf.bullet("CRUD: add/edit/delete SKUs with full metadata")
    pdf.bullet("ABC classification, velocity (high/medium/low)")
    pdf.bullet("Lot/batch/expiry tracking, FEFO priority")
    pdf.bullet("Barcode, RFID tag, dimensions, cost per unit")
    pdf.bullet("Reorder point and reorder quantity alerts")
    pdf.bullet("Movement history viewer")
    pdf.bullet("Zone capacity map visualization")
    pdf.subsection("Stock Adjustment")
    pdf.bullet("Manual stock edit with audit trail via inventoryMovements")

    # ── 11. SERIAL ──
    pdf.section_title("11", "Serial Tracking & IMEI")
    pdf.body("Route: /serial-tracking  |  Full traceability for serialized items.")
    pdf.subsection("Serial Statuses")
    pdf.body("in_stock, reserved, shipped, returned, defective, quarantine")
    pdf.subsection("Phone-Specific Fields")
    pdf.bullet("IMEI1, IMEI2, TAC prefix, color, storage, warranty dates")
    pdf.subsection("SIM Manager (/sim-manager)")
    pdf.bullet("TAC prefix database for model identification")
    pdf.bullet("Luhn algorithm IMEI calculator")
    pdf.bullet("Batch IMEI generation with correct check digits")

    # ── 12. SHIPPING ──
    pdf.section_title("12", "Shipping & Carrier Rates")
    pdf.body("Route: /shipping  |  Rate shopping and label generation.")
    pdf.subsection("Carriers (Seeded)")
    pdf.bullet("FedEx (Ground, 2Day), UPS (Ground, Next Day), USPS Priority, DHL Express, Ozon Standard")
    pdf.subsection("Box Sizing")
    pdf.bullet("6 box sizes from padded envelope to extra large")
    pdf.bullet("Auto-suggest based on order weight/dimensions")
    pdf.subsection("Label Workflow")
    pdf.bullet("Generate shippingLabels record, print modal, mock tracking number")

    # ── 13. POSTING ──
    pdf.section_title("13", "Posting Tracker (Ozon Proof)")
    pdf.body("Route: /posting-tracker  |  Ozon fulfillment proof-of-posting.")
    pdf.subsection("Capture Workflow")
    pdf.bullet("1. Enter posting ID and tracking ID")
    pdf.bullet("2. Select status: received, in_transit, delivered, posted, exception")
    pdf.bullet("3. Capture photo and/or video proof")
    pdf.bullet("4. Auto-capture geolocation (city, coordinates)")
    pdf.bullet("5. Organize by folder (e.g. 'June 2024')")
    pdf.subsection("Export")
    pdf.bullet("ZIP export: JSON metadata + photo/video files per posting")
    pdf.bullet("Search and filter by status, folder, posting ID")

    # ── 14. PDF SEQUENCER ──
    pdf.section_title("14", "PDF Sequencer & Label Tools")
    pdf.subsection("PDF Sequencer (/pdf-sequencer)")
    pdf.bullet("Upload Ozon label PDF, extract tracking IDs via pdfjs")
    pdf.bullet("Paste master sequence list, reorder pages to match")
    pdf.bullet("Export sorted PDF for printing in pick order")
    pdf.subsection("Barcode Generator (/barcode-generator)")
    pdf.bullet("Location, product, serial, multi-item, batch label generation")
    pdf.bullet("JSBarcode + QRCode output, print-ready layouts")
    pdf.subsection("Barcode Scanner (/barcode-scanner)")
    pdf.bullet("Camera or file scan -> lookup inventory/orders")

    # ── 15. RETURNS ──
    pdf.section_title("15", "Returns Processing")
    pdf.body("Route: /returns")
    pdf.bullet("Scan returned SKU, select reason code")
    pdf.bullet("Restock to inventory OR send to QC hold if defective")
    pdf.bullet("Updates order status to Returned")
    pdf.bullet("Creates return record + inventory movement")

    # ── 16. CYCLE COUNT ──
    pdf.section_title("16", "Cycle Count & Replenishment")
    pdf.subsection("Cycle Count (/cycle-count)")
    pdf.bullet("Tabs: List, Create, By Location, Dashboard")
    pdf.bullet("ABC-classified scheduling (A=weekly, B=monthly, C=quarterly)")
    pdf.bullet("Variance detection and supervisor approval")
    pdf.subsection("Replenishment (/replenishment)")
    pdf.bullet("Low-stock alerts from reorder points")
    pdf.bullet("Replenishment task creation and slotting suggestions")
    pdf.bullet("Zone capacity utilization checks")

    # ── 17. QC ──
    pdf.section_title("17", "QC Management")
    pdf.body("Route: /qc  |  Quality control holds and releases.")
    pdf.bullet("Inbound QC queue: pending items from receiving")
    pdf.bullet("QC holds: block SKUs from picking until released")
    pdf.bullet("Release to inventory or reject to defective status")
    pdf.bullet("Links to orders on QCHold status")

    # ── 18. DOCK ──
    pdf.section_title("18", "Dock & Yard Management")
    pdf.body("Route: /dock  |  Inbound appointment scheduling.")
    pdf.subsection("Appointment Lifecycle")
    pdf.body("scheduled -> checked_in -> unloading -> completed (or no_show / cancelled)")
    pdf.subsection("Fields")
    pdf.bullet("Supplier, PO number, dock number, carrier, trailer, pallet count, ASN")

    # ── 19. LABOR ──
    pdf.section_title("19", "Labor Management")
    pdf.body("Route: /labor  |  Worker performance and task assignment.")
    pdf.bullet("UPH (units per hour), accuracy %, distance walked")
    pdf.bullet("Task types: pick, pack, receive, putaway counts")
    pdf.bullet("7-day performance history with leaderboards")
    pdf.bullet("Worker skill levels (1-5) and zone assignments")

    # ── 20. ANALYTICS ──
    pdf.section_title("20", "Analytics & KPIs")
    pdf.body("Route: /analytics  |  Charts and reports via Recharts.")
    pdf.bullet("Fulfillment rate trends")
    pdf.bullet("Inventory value by category")
    pdf.bullet("Movement volume over time")
    pdf.bullet("Posting status distribution")
    pdf.bullet("Wave batch completion rates")

    # ── 21. INTEGRATIONS ──
    pdf.section_title("21", "Integrations Hub")
    pdf.body("Route: /integrations  |  External system connectors.")
    pdf.subsection("Seeded Endpoints")
    pdf.bullet("SAP ERP, Shopify OMS, FedEx TMS, Amazon Marketplace, Ozon Marketplace")
    pdf.subsection("Ozon Real Sync")
    pdf.bullet("Click Sync on Ozon Marketplace -> triggers runSheetSync() with real Google Sheet import")
    pdf.bullet("Other endpoints use simulated sync wizard (for demo)")
    pdf.subsection("Endpoint Management")
    pdf.bullet("Add/edit/toggle endpoints, configure sync interval, view error counts")

    # ── 22. GUARDIAN ──
    pdf.section_title("22", "Guardian Ops & Pressure Monitor")
    pdf.body("Route: /guardian  |  Admin-only warehouse health monitor.")
    pdf.subsection("Pressure Scenarios (detectPressureScenarios)")
    pdf.bullet("Stockout risk, SLA breach, worker overload, QC backlog, zone overcapacity")
    pdf.bullet("Levels: normal, warning, critical, emergency")
    pdf.subsection("Adaptation Engine")
    pdf.bullet("Modes: normal, efficiency, surge, crisis")
    pdf.bullet("Auto-suggestions based on time-of-day and order volume")
    pdf.subsection("System Maintenance")
    pdf.bullet("Retention-based cleanup of old audit logs, movements, tasks")
    pdf.bullet("Storage usage monitor, configurable retention days")

    # ── 23. AI ──
    pdf.section_title("23", "Vortex AI Assistant")
    pdf.body("Access: Sidebar 'Vortex AI', Command Palette, floating panel.")
    pdf.subsection("Supported Intents (Rule-Based, No API Key Needed)")
    pdf.bullet("Stock lookup: 'where is APP-IP15-256-BLK'")
    pdf.bullet("Low stock: 'low stock', 'reorder'")
    pdf.bullet("Order status: 'ORD-9984', 'pending orders'")
    pdf.bullet("Pressure: 'warehouse pressure', 'guardian'")
    pdf.bullet("Putaway: 'putaway queue'")
    pdf.bullet("Serial/IMEI: 'IMEI', 'SN-...'")
    pdf.bullet("Batch pick: 'batch pick', 'wave'")
    pdf.bullet("Dock: 'dock schedule'")
    pdf.bullet("Allocation: 'allocate', 'FEFO'")
    pdf.bullet("Labor: 'UPH', 'worker productivity'")
    pdf.bullet("Navigate: 'go to shipping'")
    pdf.bullet("Analytics: 'KPI', 'reports'")
    pdf.subsection("Suggested Prompts")
    pdf.bullet("What is the warehouse pressure?")
    pdf.bullet("Show low stock items")
    pdf.bullet("Putaway queue status")
    pdf.bullet("Optimize pick path")
    pdf.bullet("Dock schedule today")
    pdf.bullet("Order pipeline summary")

    # ── 24. MANUAL TOOLS ──
    pdf.section_title("24", "Manual Order Tools")
    pdf.subsection("Templates (/templates)")
    pdf.bullet("Raw product title -> standardized title mapping")
    pdf.subsection("Bulk Converter (/bulk-convert)")
    pdf.bullet("Batch title standardization, multi-language translation")
    pdf.bullet("Barcode/QR batch generation with ZIP export")
    pdf.subsection("Auditor (/auditor)")
    pdf.bullet("Compare master list vs scanned list, highlight discrepancies")
    pdf.subsection("Memory (/memory)")
    pdf.bullet("Aliases and preferences (site name, operator name)")

    # ── 25. ADMIN ──
    pdf.section_title("25", "Administration")
    pdf.subsection("User Management (/users)")
    pdf.bullet("CRUD users with roles, view full audit log")
    pdf.subsection("Settings (/settings)")
    pdf.bullet("Profile display name update")
    pdf.bullet("Export all data as JSON (exportAllData)")
    pdf.bullet("Import JSON backup")
    pdf.bullet("Database statistics viewer")
    pdf.bullet("Reset database (destructive)")
    pdf.bullet("Auto-refresh interval, low stock threshold")

    # ── 26. DATABASE ──
    pdf.section_title("26", "Database Schema (All 34 Tables)")
    pdf.body("Database: VortexWMS (Dexie/IndexedDB)  |  Current Version: 8")
    tables = [
        ("inventory", "sku, location, stock, barcode, lot, expiry, velocity"),
        ("orders", "orderId, status, priority, requiredSkus, carrier, tracking"),
        ("returns", "orderId, sku, reason, restocked, quantity"),
        ("inbound", "sku, qty, bin, qcStatus, poNumber, supplier"),
        ("auditLogs", "action, details, operator, timestamp"),
        ("users", "username, password, role, displayName, skillLevel"),
        ("inventoryMovements", "sku, type, quantity, orderId, operator"),
        ("cycleCounts", "sku, location, status, abcClass"),
        ("zoneCapacities", "zone, maxCapacity, category, binType"),
        ("workerTasks", "type, status, assignedTo, orderId"),
        ("replenishmentTasks", "sku, status, suggestedQty"),
        ("qcHolds", "sku, status, reason, orderId"),
        ("waveBatches", "waveId, status, orderIds"),
        ("templates", "raw, standard product title mapping"),
        ("aliases", "source, target text aliases"),
        ("preferences", "key, value settings"),
        ("simDb", "tacPrefix, modelSeries, expectedOffset"),
        ("postingRecords", "postingId, trackingId, status, photoData, geo"),
        ("purchaseOrders", "poNumber, supplier, status, items JSON"),
        ("shippingLabels", "orderId, carrier, trackingNumber, status"),
        ("carrierRates", "carrier, service, zone, rate, weightFrom/To"),
        ("workerPerformance", "workerId, date, uph, accuracy, distance"),
        ("integrationEndpoints", "name, type, provider, status, lastSync"),
        ("batchGroups", "batchId, orderIds, pickPath, pickingMethod"),
        ("pickPaths", "pathId, route JSON, totalDistance, pickerId"),
        ("boxSizes", "name, dimensions, maxWeight, material"),
        ("serialNumbers", "serialNumber, sku, imei1, status, warranty"),
        ("putawayTasks", "taskId, sku, destinationZone, sourceType"),
        ("dockAppointments", "appointmentId, dockNumber, scheduledDate"),
        ("inventoryReservations", "reservationId, orderId, fefoPriority"),
        ("sheetSyncConfigs", "spreadsheetId, autoSync, syncInterval, apiKey"),
        ("sheetSyncLogs", "configId, status, recordsProcessed, deviceId"),
        ("sheetSyncRows", "rowHash, orderId (dedup tracking)"),
        ("connectedDevices", "deviceId, operator, lastSeen, platform"),
    ]
    w = [55, 135]
    pdf.table_row(["Table", "Key Fields"], w, bold=True)
    for name, fields in tables:
        pdf.table_row([name, fields], w)

    # ── 27. LIB FUNCTIONS ──
    pdf.section_title("27", "Library Functions Reference")
    libs = [
        ("db.ts", "db, logAction, logInventoryMovement, exportAllData, seedDatabase"),
        ("auth.tsx", "AuthProvider, useAuth, login, logout, isAdmin"),
        ("store.ts", "useAppStore, addNotification, commandPaletteOpen, aiChatHistory"),
        ("allocation.ts", "allocateOrder, autoAllocatePendingOrders, releaseReservation"),
        ("pickPathOptimizer.ts", "optimizePickPath, createPickPath, createBatchGroup"),
        ("criticalWorkflow.ts", "detectPressureScenarios, calculatePressureScore"),
        ("adaptation.ts", "calculateAdaptation, getCurrentAdaptation, applyAutoSuggestions"),
        ("maintenance.ts", "runSystemCleanup, getStorageUsage, autoCleanupCheck"),
        ("aiAssistant.ts", "processUserMessage, SUGGESTED_PROMPTS"),
        ("googleSheets.ts", "fetchSheet, parseSheetUrl, parseUploadedFile, DEFAULT_OZON_SHEET"),
        ("ozonSheetMapper.ts", "detectColumnMapping, mapRowsToOzonOrders, toDbOrder"),
        ("ozonSheetSync.ts", "runSheetSync, writeBackOrderStatus, getDetectedMappingPreview"),
        ("ozonAutomation.ts", "runAutomationChecks, startAutomationLoop, stopAutomationLoop"),
        ("deviceRegistry.ts", "getDeviceId, registerDeviceHeartbeat, getOnlineDevices"),
    ]
    w = [55, 135]
    pdf.table_row(["Module", "Key Exports"], w, bold=True)
    for mod, exports in libs:
        pdf.table_row([mod, exports], w)

    # ── 28. AUTOMATION ──
    pdf.section_title("28", "Automation & Multi-Device")
    pdf.subsection("Background Automation (starts on login)")
    pdf.bullet("Layout.tsx starts startAutomationLoop(operator, 5) — checks every 5 min")
    pdf.bullet("Device heartbeat every 60 seconds")
    pdf.bullet("Stops on logout / unmount")
    pdf.subsection("What Runs Automatically")
    pdf.bullet("Sheet auto-sync (if enabled, per config interval)")
    pdf.bullet("Low-stock notifications")
    pdf.bullet("Guardian critical pressure alerts")
    pdf.bullet("High pending order volume warnings (>20)")
    pdf.subsection("Multi-Device Coordination")
    pdf.bullet("Each device: unique ID, platform detection (iPhone/Android/Windows/Mac)")
    pdf.bullet("Ozon Sheets Hub shows all warehouse devices with online status")
    pdf.bullet("Sync logs include deviceId for audit trail")

    # ── 29. PWA ──
    pdf.section_title("29", "PWA, Offline & Desktop (Tauri)")
    pdf.subsection("Offline-First Architecture")
    pdf.bullet("ALL data in IndexedDB — fully functional without internet")
    pdf.bullet("Sheet fetch and API calls require network; CSV upload works offline")
    pdf.subsection("PWA Features")
    pdf.bullet("Service worker via vite-plugin-pwa (Workbox auto-update)")
    pdf.bullet("Install prompt on supported browsers")
    pdf.bullet("Manifest: YESI-FULFILLMENT, standalone, landscape-primary")
    pdf.subsection("Tauri Desktop")
    pdf.bullet("Native Windows .exe and .msi installers")
    pdf.bullet("Same web UI in embedded webview with native shell")
    pdf.subsection("Data Backup")
    pdf.bullet("Settings -> Export JSON exports all 34 tables")
    pdf.bullet("Import JSON to restore on new device/browser")

    # ── 30. TIPS ──
    pdf.section_title("30", "Tips, Tricks & Troubleshooting")
    pdf.subsection("Ozon Sheet Sync Issues")
    pdf.bullet("PROBLEM: 'Sheet is private' -> SOLUTION: Publish sheet OR use CSV upload OR add API key")
    pdf.bullet("PROBLEM: Columns not detected -> SOLUTION: Check headers match RU/EN aliases; use Preview Columns")
    pdf.bullet("PROBLEM: Duplicate orders -> SOLUTION: Enable skipDuplicates in admin config")
    pdf.bullet("PROBLEM: No inventory for pick -> SOLUTION: Receive stock via Inbound OR check auto-allocate")
    pdf.subsection("Performance Tips")
    pdf.bullet("Use Batch Pick for 5+ orders in same zone — saves 30-40% walk time")
    pdf.bullet("Enable auto-allocate on sheet import for immediate pick readiness")
    pdf.bullet("Set reorder points on high-velocity SKUs to get early low-stock alerts")
    pdf.bullet("Run Guardian maintenance weekly to keep IndexedDB lean")
    pdf.subsection("Mobile / iPhone Tips")
    pdf.bullet("Install as PWA for fullscreen warehouse use")
    pdf.bullet("Posting Tracker camera requires HTTPS on mobile")
    pdf.bullet("Barcode wedge scanners work via BarcodeReader Enter-to-submit")
    pdf.subsection("Power User Shortcuts")
    pdf.bullet("Ctrl+K -> type 'ozon' -> jump to Ozon Sheets Hub instantly")
    pdf.bullet("Ctrl+K -> type 'batch' -> Batch Pick Center")
    pdf.bullet("Ctrl+K -> type 'pressure' -> Guardian Dashboard")
    pdf.bullet("Vortex AI -> 'optimize pick path' for route suggestions")
    pdf.subsection("Data Management")
    pdf.bullet("Export JSON before browser cache clear or DB reset")
    pdf.bullet("Audit logs track every sync, login, and inventory change")
    pdf.bullet("sheetSyncLogs provide per-device sync history for debugging")

    # ── 31. PLAYBOOKS ──
    pdf.section_title("31", "Daily Warehouse Playbooks")
    pdf.subsection("Morning Startup (Admin)")
    pdf.bullet("1. Login as VINOVJ")
    pdf.bullet("2. Check Dashboard KPIs and notification bell")
    pdf.bullet("3. Open Ozon Sheets Hub -> Sync Now (or verify auto-sync ran)")
    pdf.bullet("4. Review Guardian pressure — resolve any critical alerts")
    pdf.bullet("5. Check Dock schedule for inbound appointments")
    pdf.subsection("Order Fulfillment (Operator)")
    pdf.bullet("1. Ozon Sheets sync brings new orders overnight")
    pdf.bullet("2. Batch Pick Center -> select pending orders -> optimize path")
    pdf.bullet("3. Pick & Pack -> scan SKUs -> mark Shipped")
    pdf.bullet("4. PDF Sequencer -> sort Ozon labels in pick order")
    pdf.bullet("5. Posting Tracker -> photo proof + geolocation per posting")
    pdf.subsection("Inbound Day")
    pdf.bullet("1. Dock -> check-in supplier appointment")
    pdf.bullet("2. Inbound Receiving -> scan pallets, PO reconcile")
    pdf.bullet("3. Putaway -> complete directed tasks to bins")
    pdf.bullet("4. QC -> release passed items, hold failed")
    pdf.subsection("End of Day")
    pdf.bullet("1. Cycle Count -> complete scheduled ABC counts")
    pdf.bullet("2. Analytics -> review fulfillment rate")
    pdf.bullet("3. Settings -> Export JSON backup")
    pdf.bullet("4. Guardian -> run system cleanup if needed")
    pdf.subsection("Private Sheet Workflow (Recommended)")
    pdf.bullet("1. In Google Sheets: File -> Download -> CSV")
    pdf.bullet("2. Ozon Sheets Hub -> CSV Upload tab -> drop file")
    pdf.bullet("3. Review column mapping preview")
    pdf.bullet("4. Orders appear in Pick & Pack within seconds")

    pdf.output(OUT_PATH)
    return OUT_PATH


if __name__ == "__main__":
    path = build_pdf()
    print(f"PDF generated: {path}")
    print(f"Size: {os.path.getsize(path) / 1024:.1f} KB")
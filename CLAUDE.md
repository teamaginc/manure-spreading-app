# TeamAg Manure Spreading App

## Architecture
- **Frontend:** Vanilla JS (no framework/build step), HTML5, CSS3
- **Maps:** Leaflet.js + Leaflet.Draw for field editing
- **Backend:** Firebase Auth + Firestore (NoSQL)
- **Hosting:** DreamHost (not Firebase Hosting)
- **PWA:** manifest.json + sw.js for offline capability

## Deployment
- **Live site:** app.teamaginc.com
- **Method:** GitHub Actions → SFTP to DreamHost on push to `main`
- **Workflow:** `.github/workflows/deploy.yml`
- **Host:** iad1-shared-b7-33.dreamhost.com → /home/dh_ijs34w/app.teamaginc.com/
- **No build step** — files are deployed as-is

## Key Files
| File | Purpose |
|------|---------|
| `js/firebase-config.js` | Firebase init, Auth, DB, Admin, Farm APIs (ES module) |
| `js/app.js` | Screen navigation, auth flow, sidebar, setup |
| `js/admin.js` | Admin panel: farmer list, farmer detail, farm CRUD |
| `js/farm-profile.js` | User's own farm management (fields, equipment, storages, members) |
| `js/field-editor.js` | Leaflet.Draw field drawing/editing on map |
| `js/past-records.js` | View spreading records by field with seasonal grouping |
| `js/record-editor.js` | Edit individual spreading record points (lasso/delete) |
| `js/spreading.js` | GPS tracking during active manure spreading |
| `js/map.js` | Leaflet map initialization for spreading screen |
| `js/shapefile-handler.js` | Parse .zip shapefiles and .geojson files |
| `css/styles.css` | All styles, mobile-first, desktop sidebar at 768px+ |

## Firestore Structure
```
users/{uid}           → { email, name, role, farmId, features }
users/{uid}/logs/{id} → spreading log records
users/{uid}/fields/{id} → legacy per-user field uploads
farms/{farmId}        → { id, name, createdBy }
farms/{farmId}/members/{uid}    → { userId, email, name, role }
farms/{farmId}/fields/{id}      → farm field boundaries
farms/{farmId}/equipment/{id}   → equipment (tanks, spreaders)
farms/{farmId}/storages/{id}    → manure storages
invites/{id}          → farm collaboration invites
config/features       → global feature toggles
```

## Important Patterns

### GeoJSON Storage
Firestore does not support nested arrays. GeoJSON coordinates are nested arrays.
**Always store GeoJSON as a JSON string** in `geojsonStr` field, never as a raw `geojson` object.
Parse back with `JSON.parse()` on read. See `saveFarmField()`, `getFarmFields()`, `saveFieldData()`, `getUserFields()` in firebase-config.js.

### Admin Override Pattern
`FieldEditor` and `PastRecords` accept an `adminFarmId` property. When set by AdminPanel, they operate on that farm instead of the logged-in user's farm. Cleared on `cleanup()`.

### Screen Navigation
Single-page app with `App.showScreen(screenId)`. All screens are `<div class="screen">` elements toggled via `.active` class. Desktop gets a fixed sidebar; mobile uses back buttons.

### Roles
- `superadmin` — hardcoded for erics@teamaginc.com, full access
- `admin` — can access admin panel, manage farmers
- `farmer` — standard user

### firebase-config.js is an ES Module
Loaded with `<script type="module">`. Exports to `window.*` for other non-module scripts.

# WagleWeb — Full Project Reference

## Project identity
- Shop: **Wagle Electricals & Wagle Generals**, Bazaar Road, Damauli, Tanahun, Nepal
- Phone / WhatsApp: `+977 974-843-4921` (`9779748434921`)
- Hours: Sun–Fri 7 am–8 pm · Sat 8 am–6 pm · Est. 2056 BS

## File structure
```
index.html        — entire frontend (markup + CSS + JS, 1741 lines)
server.js         — Node/Express backend (to be built)
admin.html        — admin panel (to be built)
package.json      — Node dependencies
.env              — secrets template
.gitignore
CLAUDE.md         — this file
README.md         — setup guide (EN + NP)
```

## Frontend: index.html

### Routing
Hash-based SPA. `go(route)` swaps `.view.active`, updates nav `.active` class, scrolls to top.
Routes: `home` | `products` | `scan` | `cart` | `track`

### Design tokens (CSS variables)
| Token | Value | Purpose |
|---|---|---|
| `--bg` | `#f6efd9` | page cream |
| `--ink` | `#0f3527` | deep emerald text |
| `--gold` | `#d99c1f` | accent gold |
| `--emerald` | `#0f3527` | section backgrounds |
| `--jade` | `#3ec591` | success / in-stock |
| `--orange` | `#e89255` | warning / limited |
| `--red` | `#c0392b` | error / remove |

Fonts: `Cormorant Garamond` (headings), `Inter` (body), `JetBrains Mono` (mono labels),
`Noto Serif Devanagari` + `Tiro Devanagari Hindi` (Nepali text).

Responsive breakpoints: 1080 px (tablet) · 720 px (mobile, hamburger menu).

### Pages

#### #home
- Hero: Nepali headline `वाग्ले इलेक्ट्रिकल्स`, animated gold bolt, hero stats (hours, SKUs, delivery)
- Category grid (`#catGrid`) rendered by `renderCategories()`
- AI estimate scanner promo banner → links to `#scan`
- "Why Wagle" trust section (3 cards)
- Location section: store info + Leaflet map (`#homeMap`, coords `27.9667, 84.2667`)

#### #products
- Sticky toolbar: search input (`#searchInput`) + category tabs (`#tabs`)
- `renderProducts()` filters `PRODUCTS` array by `State.filter` and `State.search`
- `renderTabs()` rebuilds tab strip on each filter change
- 4-column product grid (`#productGrid`); each card has "+ Add" button → `addToCart(id)`

#### #scan (Estimate Scanner)
- Drag-drop / click-to-upload image → `showPreview(file)` (file reader, no OCR yet)
- Textarea (`#estimateText`) for pasting text; "Load Demo Estimate" fills sample text
- `runParse()` → splits lines → `extractQty(line)` + `matchProduct(line)` → classifies each as:
  - **match** — top score ≥ 6 AND gap to second ≥ 3
  - **ambig** — top score ≥ 3
  - **miss** — below threshold
- `renderParseList()` — builds results table with status icons, qty inputs, prices
- Clarify modal (`#clarifyModal`) — pick from top-4 suggestions; confirm/skip
- "Add Matched Items to Cart" → `addToCartSilent()` for each matched item → navigates to cart
- "WhatsApp this Estimate" → opens WhatsApp with formatted item list

#### #cart
- `renderCart()` → `cartItems()` joins `State.cart` with `PRODUCTS` data
- Cart list: qty ±1 (`setQty`), remove (`removeItem`)
- Summary sidebar: subtotal + NPR 150 delivery fee (pickup = free)
- Pickup/Delivery toggle (`[data-d]` buttons)
- Customer form (shown only for delivery): name, phone, area, landmark → saved to `State.customer` + localStorage
- "Place Order Request" → `placeOrder()` → `POST /api/orders`
- "WhatsApp this Cart" → formatted WhatsApp link
- Success overlay (`#placedOverlay`) shows order ID → "View Order Status" → `#track`

#### #track
- `renderTrack()` — fetches `GET /api/orders/:orderId` from backend; falls back to `State.order`
- Order card: ID, placed date/time, item count + subtotal, pickup/delivery method
- 6-stage stepper with animated progress bar:
  1. submitted · 2. accepted · 3. processing · 4. ready (pickup only) · 5. enroute (delivery only) · 6. delivered
- Active stage pulsing ring animation; done stages show checkmark
- Stage panel: title, message, context actions (call/WhatsApp for stage 1; map for stage 5)
- Stage 5 (enroute): Leaflet map with animated truck icon moving shop → destination
- Dev panel (⚡ button, bottom-right): simulate any stage, reset order

### Catalogue data
**8 CATEGORIES**: wiring · lighting · switches · solar · fans · safety · tools · extras

**22 PRODUCTS** (ids p01–p22). Each has:
```js
{ id, name, brand, cat, price, stock:'in'|'low', icon, ph, keys:[] }
```
Key products: Havells 2.5mm wire (NPR 5800), Philips LED 9W (NPR 320), Crompton ceiling fan (NPR 5400),
Schneider MCB 16A (NPR 340), Luminous solar panel 165W (NPR 9800), Exide battery 150Ah (NPR 18500).

**ICONS** — inline SVG map: wire, bulb, switch, solar, fan, mcb, tool, plug, panel, battery, led

### State & storage
```js
State = { cart, filter, search, delivery, order, customer, parsed }
// localStorage:
'wagle.cart'     // [{id, qty}, ...]
'wagle.order'    // order object or null
'wagle.customer' // {name, phone, area, landmark}
```

### Backend API (already wired in frontend)
```
API_BASE_URL = 'http://localhost:5000/api'   (localhost)
             = '/api'                         (production)
```
Endpoints the frontend already calls:
| Method | Path | Called from |
|---|---|---|
| GET | `/api/products` | `init()` on page load |
| POST | `/api/orders` | `placeOrder()` |
| GET | `/api/orders/:id` | `renderTrack()` |

All calls go through `apiCall(endpoint, method, body)` — generic fetch wrapper, throws on non-OK.
Frontend gracefully falls back to hardcoded data if backend is unavailable.

## Backend: server.js (to be built)

### Stack
- Node.js + Express
- Firebase Admin SDK → Firestore database
- `cors`, `dotenv`, `multer` (file uploads for scan), `axios`/`node-fetch`

### Planned endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/products` | Return products from Firestore (or seed) |
| POST | `/api/orders` | Create order in Firestore, trigger WhatsApp |
| GET | `/api/orders/:id` | Fetch order by ID |
| PATCH | `/api/orders/:id/stage` | Admin: update order stage |
| POST | `/api/scan-estimate` | Receive image → Claude Vision → return items JSON |

### Order document schema (Firestore `orders` collection)
```js
{
  orderId: 'WG-XXXXXX',       // generated: 'WG-' + 6 random alphanumeric
  items: [{id, name, qty, price}],
  subtotal: Number,
  delivery: 'pickup'|'delivery',
  customer: {name, phone, area, landmark} | null,
  stage: 1,                   // 1–6
  placedAt: Timestamp,
  updatedAt: Timestamp,
}
```

### Environment variables (.env)
```
PORT=5000
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
ANTHROPIC_API_KEY=
WHATSAPP_TOKEN=            # Twilio or Meta Cloud API token
WHATSAPP_FROM=             # sender number
SHOP_WHATSAPP=9779748434921
ADMIN_PASSWORD=            # bcrypt hash or plain for dev
```

## Admin panel: admin.html (to be built)
- Password-gated (sessionStorage token, checked against `/api/admin/login`)
- Lists all orders, real-time Firestore listener
- One-click stage advance buttons
- Same cream-and-emerald design language as `index.html.html`
- Bilingual labels (English + Nepali)

## AI Estimate Scanner backend
- `POST /api/scan-estimate` receives multipart image
- Sends to Anthropic Claude Vision API (claude-sonnet-4-6 or later)
- Prompt: extract line items as JSON `[{raw, item, qty, unit}]`
- Frontend `runParse()` then maps results through `matchProduct()` as usual

## WhatsApp notifications
- Triggered by `POST /api/orders` after order saved
- Message: order ID, item list, total, delivery type, customer name/area
- Implementation: Twilio WhatsApp API or Meta Cloud API

## Design rules (DO NOT CHANGE)
- Never alter CSS variables, font stacks, color values, or layout classes
- Never change the cream/emerald/gold palette
- New UI elements (admin.html) must reuse the same token names
- Bilingual text: English label + Nepali `.np` or `.np-tag` span below/alongside

## Development commands (once built)
```bash
npm install
npm run dev        # nodemon server.js
# open index.html.html in browser (or serve via Express static)
```

# WagleWeb — Wagle Electricals & Generals

Frontend + lightweight backend for **Wagle Electricals & Wagle Generals**, Damauli, Tanahun, Nepal.

**How orders work:** Customer places an order → WhatsApp opens automatically with full order details → shop owner receives it directly. No database, no sign-up, nothing to maintain.

---

## What's inside

| File | Purpose |
|---|---|
| `index.html.html` | Complete customer-facing storefront |
| `admin.html` | *(optional)* Order stage simulation |
| `backend/server.js` | Lightweight Express API |
| `backend/package.json` | Node dependencies |
| `backend/.env.template` | Environment variable template |

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML + CSS + JS (single file) |
| Backend | Node.js + Express |
| AI Scanning | Groq (free, fast) |
| Orders | WhatsApp via `wa.me` link |
| Database | None needed |

---

## Setup (English)

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
copy .env.template .env      # Windows
cp .env.template .env         # Mac / Linux
```

Open `.env` and add your Groq API key (free at [console.groq.com](https://console.groq.com)).

### 3. Start the backend

```bash
npm run dev        # development (auto-restarts)
npm start          # production
```

```
🚀 Wagle backend → http://localhost:5000
```

### 4. Open the frontend

Open `index.html.html` in your browser, or serve the whole folder:

```bash
npx serve .
# then visit http://localhost:3000
```

### 5. Place a test order

1. Add items to cart → Place Order Request
2. WhatsApp opens automatically with the full order
3. Send it — the shop owner receives it instantly

---

## AI Estimate Scanner

The Scan Estimate page lets customers upload a photo of a contractor's estimate.
The image is sent to Groq's vision model which reads every line and matches it to the catalogue.

**Requires:** `GROQ_API_KEY` in `.env`

If the key is not set, the scanner still works for typed/pasted text — only photo upload is disabled.

---

## Dev commands

```bash
cd backend
npm run dev     # nodemon (auto-restart on save)
npm start       # plain node
```

---

---

# सेटअप गाइड (नेपाली)

**अर्डर कसरी काम गर्छ:** ग्राहकले अर्डर राख्छ → WhatsApp स्वतः खुल्छ र पूरा अर्डर पठाइन्छ → पसल धनीले सिधै WhatsApp मा अर्डर पाउँछ। कुनै डेटाबेस वा साइन-अप आवश्यक छैन।

---

## आवश्यक चिजहरू

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Groq API key** — [console.groq.com](https://console.groq.com) मा नि:शुल्क

---

## सेटअप चरणहरू

### १. Dependencies इन्स्टल

```bash
cd backend
npm install
```

### २. Environment फाइल

```bash
copy .env.template .env
```

`.env` खोल्नुहोस् र Groq API key राख्नुहोस्।

### ३. Backend सुरु गर्नुहोस्

```bash
npm run dev
```

यो देखिनुपर्छ:
```
🚀 Wagle backend → http://localhost:5000
```

### ४. वेबसाइट खोल्नुहोस्

`index.html.html` ब्राउजरमा खोल्नुहोस्।

वा टर्मिनलमा:
```bash
npx serve .
```

त्यसपछि `http://localhost:3000` मा जानुहोस्।

### ५. अर्डर परीक्षण

Cart मा सामान थप्नुहोस् → "Place Order Request" थिच्नुहोस् → WhatsApp स्वतः खुल्नेछ → पठाउनुहोस्।

---

## मद्दत

फोन: **+977 974-843-4921**  
WhatsApp: [wa.me/9779748434921](https://wa.me/9779748434921)

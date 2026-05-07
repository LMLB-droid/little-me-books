# Little Me Library — Backend Setup Guide

This is the AI engine that powers your personalised book business. Follow these steps to get it running.

---

## What You Need to Set Up First

Before running the server, you need accounts at:

1. **fal.ai** — AI image generation
2. **Stripe** — payment processing
3. **Resend** — sending emails
4. **Book Vault** — print on demand

---

## Step 1 — Get Your API Keys

### fal.ai
1. Go to [fal.ai](https://fal.ai) and create a free account
2. Go to Dashboard → API Keys
3. Click "Create New Key"
4. Copy the key — starts with `fal-...`

### Stripe
1. Go to [stripe.com](https://stripe.com) and create an account
2. Go to Dashboard → Developers → API keys
3. Copy the **Secret key** (starts with `sk_live_...`)
4. For webhooks: Dashboard → Developers → Webhooks → Add endpoint
   - URL: `https://your-api-domain.com/api/webhooks/stripe`
   - Events: `payment_intent.payment_failed`, `payment_intent.succeeded`
   - Copy the **Signing secret** (starts with `whsec_...`)

### Resend
1. Go to [resend.com](https://resend.com) and create a free account
2. Go to API Keys → Create API Key
3. Copy the key (starts with `re_...`)
4. You need to verify your sending domain (littlemelibrary.com) in their DNS settings

### Book Vault
1. Go to [bookvault.app](https://bookvault.app) and create an account
2. Set up your book products in their system with your PDF templates
3. Get your API key from your account settings

---

## Step 2 — Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Then open .env and fill in all the values
```

Open `.env` in any text editor and replace the placeholder values with your real keys.

---

## Step 3 — Install Dependencies

```bash
# Make sure you have Node.js 18+ installed
node --version

# Install packages
npm install
```

---

## Step 4 — Run the Server

```bash
# Development (auto-restarts on changes)
npm run dev

# Production
npm start
```

You should see:
```
🌟 Little Me Library API running on port 3001
   Health check: http://localhost:3001/api/health
```

Visit `http://localhost:3001/api/health` — if you see `{"status":"ok"}` it's working.

---

## Step 5 — Deploy to Vercel

Since your website is already on Vercel, deploy the backend there too.

1. Create a new folder in your GitHub repo called `backend` (these files go there)
2. In Vercel, create a **new project** pointing to the same GitHub repo, root directory = `backend`
3. Add all environment variables in Vercel → Settings → Environment Variables
4. Deploy — your API will be live at `https://your-backend.vercel.app`

**Important:** Vercel's free tier has a 10-second function timeout. AI generation takes longer. You'll want to either:
- Use **Vercel Pro** (60-second timeout)
- Or switch to **Railway.app** or **Render.com** (no timeout limits — recommended for this use case)

---

## Step 6 — Connect Your Website to the Backend

In your `customize.html`, update the form submission to POST to your backend URL instead of showing the fake success screen. I'll help you do this in the next step.

---

## How the Order Flow Works

```
Customer submits order form (photo + name + book choice)
    ↓
POST /api/orders
    ↓
Stripe PaymentIntent created (card details collected but NOT charged yet)
    ↓
AI image generation runs in background (fal.ai, ~10-15 mins)
    ↓
PDF assembled (PDFKit)
    ↓
Preview email sent to customer
    ↓
Customer clicks "Approve & Send to Print"
    ↓
GET /api/orders/:id/approve
    ↓
Stripe payment captured ✅
    ↓
PDF sent to Book Vault → printed & shipped 📚
    ↓
Printing confirmation email sent
```

---

## File Structure

```
backend/
├── server.js              ← Main API server (start here)
├── package.json           ← Dependencies
├── .env.example           ← Copy to .env with real keys
├── .env                   ← Your real keys (NEVER commit this!)
├── services/
│   ├── falai.js           ← AI image generation
│   ├── pdfgen.js          ← PDF assembly
│   ├── bookvault.js       ← Print fulfilment
│   └── email.js           ← Customer emails
├── books/
│   └── magical-adventure.json  ← Book content + illustration prompts
└── uploads/               ← Created automatically — stores photos & PDFs
    ├── photos/
    └── orders/
```

---

## Estimated Running Costs (per book ordered)

| Item | Cost |
|------|------|
| fal.ai — 17 illustrations | ~$1.00–1.40 |
| PDF generation | ~$0.00 |
| Email (Resend) | ~$0.00 (free tier) |
| Book Vault print + ship | ~$10–16 |
| Stripe fee (on $24–34) | ~$1.00 |
| **Total cost per book** | **~$12–18** |
| **Your selling price** | **$24–34** |
| **Gross profit per book** | **~$6–16** |

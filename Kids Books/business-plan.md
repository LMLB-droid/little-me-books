# Little Me Library — Business & Technical Plan
*Last updated: May 2026*

---

## 1. Business Overview

**Little Me Library** is a personalised children's book company. Parents upload a photo of their child and enter their name. AI technology transforms every character illustration in the book to resemble that child, and their name appears naturally throughout the story. Books are printed on demand by Book Vault and shipped globally.

**Tagline:** *The book where YOUR child is the star.*

---

## 2. Revenue Model

| Product | Price | Est. COGS (Book Vault print + ship) | Gross Margin |
|---|---|---|---|
| Softcover book | $24 | ~$10–12 | ~50–58% |
| Hardcover book | $34 | ~$14–16 | ~53–59% |
| Gift Bundle (2 books) | $59 | ~$26–30 | ~49–56% |
| Digital PDF only | $9.99 | ~$0.50 (hosting) | ~95% |

**Target:** 100 orders/month = ~$3,400 revenue in Month 3. Scale to 1,000 orders/month by Month 12.

---

## 3. Technical Architecture

### 3a. Frontend (Website — Built ✅)
- `index.html` — Marketing landing page
- `catalog.html` — Book selection with filters
- `customize.html` — 5-step ordering flow (book → photo → personalise → format → checkout)
- Responsive design, white/grey/blue brand theme

### 3b. Backend Stack (To Build)
**Recommended: Next.js + Node.js API on Vercel**

```
Customer Browser
    ↓ HTTPS
Next.js Frontend (Vercel)
    ↓
Node.js API Routes
    ↓               ↓               ↓
Stripe API      OpenAI/Replicate  Book Vault API
(payments)      (AI image gen)   (print + ship)
    ↓               ↓
PostgreSQL DB   AWS S3
(orders)        (generated PDFs)
```

### 3c. AI Personalisation Flow
1. Customer uploads photo → stored temporarily in S3
2. API sends photo + book character template to AI service
3. AI generates personalised character illustrations (one per page)
4. System replaces [NAME] tokens in text with child's name
5. PDF assembly: text + personalised illustrations → final book PDF
6. PDF sent to Book Vault for printing
7. Customer receives digital preview email (24hrs)
8. Customer approves → Book Vault prints and ships

**AI Image Options:**
- **Replicate API** (recommended) — run Stable Diffusion or FLUX models, cost ~$0.10–0.30 per image set
- **OpenAI DALL-E 3** — higher quality, ~$0.04–0.08 per image via API
- **Fal.ai** — fast, cost-effective, good for consistent style

---

## 4. Book Vault Integration

**Book Vault** (bookvault.app) is a UK-based print-on-demand service for books with global fulfilment.

### Key Steps to Set Up:
1. **Create a Book Vault account** at bookvault.app
2. **Upload book templates** — create the base book layout in their system (PDF format, standard sizing: 8.5" × 8.5" for square children's books)
3. **Get API credentials** — Book Vault provides an API for automated order submission
4. **Integrate the API** — when a customer approves their preview, our backend calls the Book Vault API with:
   - The personalised PDF file (uploaded to Book Vault's system)
   - Customer shipping address
   - Product type (softcover/hardcover)
5. Book Vault handles printing, binding, and worldwide shipping

### Book Vault API Workflow:
```javascript
// Pseudocode for order submission
async function submitToBookVault(order) {
  // 1. Upload personalised PDF
  const pdfUrl = await uploadToBookVault(order.personalizedPdfPath);
  
  // 2. Create the order
  const bookVaultOrder = await bookVaultApi.createOrder({
    title: order.bookTitle,
    isbn: order.bookIsbn,        // pre-registered ISBNs per title
    format: order.format,         // 'hardcover' | 'softcover'
    quantity: 1,
    pdfUrl: pdfUrl,
    shippingAddress: {
      name: order.customerName,
      line1: order.address.line1,
      city: order.address.city,
      postcode: order.address.postcode,
      country: order.address.country
    }
  });
  
  return bookVaultOrder.trackingId;
}
```

### Book Setup for Book Vault:
- Book size: **8.5" × 8.5"** square (standard children's picture book)
- Bleed: 3mm on all sides
- Resolution: 300 DPI minimum
- File format: PDF/X-1a or PDF/X-3
- Colour profile: CMYK

---

## 5. Payment Processing — Stripe

1. **Create a Stripe account** at stripe.com
2. **Add Stripe.js** to the checkout page
3. **Create a PaymentIntent** from the backend when customer reaches checkout
4. **Capture payment** after customer approves digital preview (or immediately — decide your model)

```javascript
// Backend: create payment intent
const paymentIntent = await stripe.paymentIntents.create({
  amount: order.priceInCents,   // e.g. 3400 for $34.00
  currency: 'usd',
  metadata: { orderId: order.id, customerEmail: order.email }
});
```

**Stripe fees:** 2.9% + $0.30 per transaction (US). International cards slightly higher.

---

## 6. Go-To-Market Plan

### Phase 1 — Launch (Month 1–2)
- Publish website with 2–3 books
- Set up Stripe + Book Vault accounts
- Build backend AI integration (MVP)
- Soft launch to family/friends for feedback
- Set up Instagram + TikTok accounts (@littlemebooks)

### Phase 2 — Growth (Month 3–6)
- Run Facebook/Instagram ads targeting parents of 2–7 year olds
- Influencer gifting (parenting bloggers, family YouTubers)
- Gift guides (Christmas, birthdays, baby showers)
- SEO content: "personalised children's books", "unique birthday gift for kids"

### Phase 3 — Scale (Month 6–12)
- Expand to 10+ book titles
- Add sibling bundles (two characters)
- Add gift messaging/wrapping option
- Launch affiliate programme for parent influencers
- Consider wholesale to gift shops

---

## 7. Immediate Next Steps

| Priority | Task | Notes |
|---|---|---|
| 🔴 HIGH | Register domain — littlemebooks.com | Check availability, ~$12/yr |
| 🔴 HIGH | Create Book Vault account | bookvault.app |
| 🔴 HIGH | Create Stripe account | stripe.com |
| 🔴 HIGH | Register business / sole trader | Depends on your country |
| 🟡 MED | Deploy website to Vercel or Netlify | Free tier available |
| 🟡 MED | Build backend API (Node.js) | AI + Book Vault integration |
| 🟡 MED | Register social media handles | @littlemebooks |
| 🟢 LOW | Design proper book illustrations | Commission an illustrator or use AI art |
| 🟢 LOW | Add Google Analytics | Track visitors and conversions |

---

## 8. Legal Considerations
- **Privacy policy** — required (you're handling children's photos)
- **Terms of service** — required
- **COPPA compliance** (US) / **GDPR** (UK/EU) — critical for children's data
- **Clear photo deletion policy** — state when photos are deleted
- **Business registration** — sole trader or limited company

---

## 9. Estimated Startup Costs

| Item | Est. Cost |
|---|---|
| Domain name | $12/yr |
| Vercel/Netlify hosting | Free (starter) |
| Stripe setup | Free (pay-per-transaction) |
| OpenAI/Replicate API credits | $50–100/mo (scales with orders) |
| Book Vault account | Free (pay per book) |
| First test book prints | $50–100 |
| Facebook/Instagram ads | $200–500/mo (recommended start) |
| **Total Month 1** | **~$350–750** |

---

*Built with Little Me Library Cowork session · littlemebooks.com*

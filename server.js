/**
 * Little Me Library — Backend API Server
 *
 * This is the engine of the business. It handles:
 * 1. Receiving orders from the website
 * 2. Processing uploaded child photos
 * 3. Generating personalised illustrations via fal.ai
 * 4. Assembling the final print-ready PDF
 * 5. Sending a preview email to the customer
 * 6. Capturing payment via Stripe (on approval)
 * 7. Submitting the order to Book Vault for printing
 *
 * Run with: node server.js (or npm run dev for auto-reload)
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Stripe loaded lazily so a missing key doesn't crash the server on startup
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set — add it in your Railway environment variables');
    }
    _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// Our services
const { generateAllIllustrations } = require('./services/falai');
const { generateBookPDF } = require('./services/pdfgen');
const { uploadPDFToBookVault, createBookVaultOrder } = require('./services/bookvault');
const { sendOrderConfirmation, sendPreviewReadyEmail, sendPrintingConfirmation } = require('./services/email');

const app = express();
const PORT = process.env.PORT || 3001;

// =====================
// MIDDLEWARE
// =====================

// Allow requests from the website
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'https://www.littlemelibrary.com',
    'http://localhost:3000',    // For local development
    'http://127.0.0.1:5500'    // VS Code Live Server
  ],
  credentials: true
}));

// Parse JSON — BUT NOT on the Stripe webhook route (needs raw body)
app.use((req, res, next) => {
  if (req.path === '/api/webhooks/stripe') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

// File uploads — store in ./uploads/photos/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads/photos';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are accepted'));
    }
  }
});

// =====================
// IN-MEMORY ORDER STORE
// =====================
// NOTE: In production, replace this with a proper database (PostgreSQL via Supabase etc.)
const orders = new Map();

// =====================
// BOOK CATALOGUE
// =====================
// Load available books
function loadBook(bookId) {
  const bookPath = path.join(__dirname, 'books', `${bookId}.json`);
  if (!fs.existsSync(bookPath)) {
    throw new Error(`Book not found: ${bookId}`);
  }
  return JSON.parse(fs.readFileSync(bookPath, 'utf8'));
}

// =====================
// PRICING
// =====================
const PRICES = {
  softcover: parseInt(process.env.PRICE_SOFTCOVER || '2400'),   // $24.00
  hardcover: parseInt(process.env.PRICE_HARDCOVER || '3400'),   // $34.00
  bundle:    parseInt(process.env.PRICE_BUNDLE    || '5900'),   // $59.00
  digital:   parseInt(process.env.PRICE_DIGITAL   || '999')     // $9.99
};

// =====================
// HELPER: Generate a friendly order ID
// =====================
function generateOrderId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'LML-';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// =====================
// ROUTES
// =====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Little Me Library API', timestamp: new Date().toISOString() });
});

// =====================
// POST /api/orders — Create a new order
// =====================
// This is called when a customer submits the order form on the website.
// It:
// 1. Creates an order record
// 2. Creates a Stripe PaymentIntent (but does NOT charge yet)
// 3. Kicks off AI image generation in the background
// 4. Returns the client secret so the website can collect card details
//
app.post('/api/orders', upload.single('photo'), async (req, res) => {
  try {
    const {
      bookId,
      childName,
      pronounSet,      // 'neutral' | 'boy' | 'girl'
      dedicationMessage,
      format,          // 'softcover' | 'hardcover'
      customerEmail,
      customerName
    } = req.body;

    // Validate required fields
    if (!bookId || !childName || !format || !customerEmail || !req.file) {
      return res.status(400).json({
        error: 'Missing required fields: bookId, childName, format, customerEmail, and a photo are all required'
      });
    }

    if (!PRICES[format]) {
      return res.status(400).json({ error: `Invalid format: ${format}` });
    }

    // Load the book
    let book;
    try {
      book = loadBook(bookId);
    } catch (e) {
      return res.status(404).json({ error: e.message });
    }

    // Create internal order
    const orderId = generateOrderId();
    const photoPath = req.file.path;

    // Create Stripe PaymentIntent (hold, don't charge yet — charge on approval)
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: PRICES[format],
      currency: 'usd',
      capture_method: 'manual',   // We'll capture payment after customer approves preview
      metadata: {
        orderId,
        bookId,
        childName,
        format,
        customerEmail
      }
    });

    // Store order
    const order = {
      id: orderId,
      bookId,
      childName,
      pronounSet: pronounSet || 'neutral',
      dedicationMessage: dedicationMessage || '',
      format,
      customerEmail,
      customerName: customerName || customerEmail,
      photoPath,
      status: 'processing',
      stripePaymentIntentId: paymentIntent.id,
      createdAt: new Date().toISOString()
    };
    orders.set(orderId, order);

    // Respond immediately so the customer doesn't wait
    res.json({
      orderId,
      clientSecret: paymentIntent.client_secret,
      message: 'Order received — we\'re creating your book!'
    });

    // Send confirmation email
    try {
      await sendOrderConfirmation({
        customerEmail,
        customerName: customerName || '',
        childName,
        bookTitle: book.title,
        orderId,
        format
      });
    } catch (emailErr) {
      console.error('[Server] Confirmation email failed:', emailErr.message);
    }

    // ====================================================
    // BACKGROUND PROCESSING — AI generation + PDF assembly
    // This runs after we've responded to the customer
    // ====================================================
    processOrder(order, book).catch(err => {
      console.error(`[Server] ❌ Background processing failed for ${orderId}:`, err.message);
      const storedOrder = orders.get(orderId);
      if (storedOrder) {
        storedOrder.status = 'failed';
        storedOrder.error = err.message;
      }
    });

  } catch (err) {
    console.error('[Server] /api/orders error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/**
 * Background order processing pipeline
 * Runs after the HTTP response has been sent
 */
async function processOrder(order, book) {
  const { id: orderId, childName, pronounSet, dedicationMessage, photoPath, format } = order;

  console.log(`\n[Server] 🚀 Processing order ${orderId} for "${childName}"...`);

  // Directories for this order
  const orderDir = path.join('./uploads/orders', orderId);
  const illustrationDir = path.join(orderDir, 'illustrations');
  fs.mkdirSync(illustrationDir, { recursive: true });

  // Step 1: Generate AI illustrations
  console.log(`[Server] Step 1: Generating ${book.pages.filter(p => p.hasIllustration).length} illustrations...`);
  orders.get(orderId).status = 'generating_illustrations';

  const illustrations = await generateAllIllustrations(
    photoPath,
    book.pages,
    childName,
    illustrationDir
  );

  // Step 2: Assemble the PDF
  console.log(`[Server] Step 2: Assembling PDF...`);
  orders.get(orderId).status = 'assembling_pdf';

  const pdfPath = path.join(orderDir, `${orderId}-preview.pdf`);
  await generateBookPDF({
    book,
    childName,
    pronounSet,
    dedicationMessage,
    illustrations,
    outputPath: pdfPath
  });

  // Step 3: Make the preview available
  orders.get(orderId).pdfPath = pdfPath;
  orders.get(orderId).status = 'awaiting_approval';

  const previewUrl = `${process.env.FRONTEND_URL || 'https://www.littlemelibrary.com'}/api/preview/${orderId}`;
  const approveUrl = `${process.env.FRONTEND_URL || 'https://www.littlemelibrary.com'}/api/orders/${orderId}/approve?token=${order.stripePaymentIntentId.slice(-8)}`;

  // Step 4: Send preview email
  console.log(`[Server] Step 4: Sending preview email to ${order.customerEmail}...`);
  await sendPreviewReadyEmail({
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    childName,
    orderId,
    previewPdfUrl: previewUrl,
    approveUrl
  });

  console.log(`[Server] ✅ Order ${orderId} ready for approval`);
}

// =====================
// GET /api/preview/:orderId — Serve the preview PDF
// =====================
app.get('/api/preview/:orderId', (req, res) => {
  const order = orders.get(req.params.orderId);

  if (!order || !order.pdfPath || !fs.existsSync(order.pdfPath)) {
    return res.status(404).json({ error: 'Preview not ready yet or order not found' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${order.childName}s-book-preview.pdf"`);
  fs.createReadStream(order.pdfPath).pipe(res);
});

// =====================
// GET /api/orders/:orderId/status — Check order status
// =====================
app.get('/api/orders/:orderId/status', (req, res) => {
  const order = orders.get(req.params.orderId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  res.json({
    orderId: order.id,
    status: order.status,
    childName: order.childName,
    bookId: order.bookId,
    format: order.format,
    createdAt: order.createdAt,
    previewReady: order.status === 'awaiting_approval',
    approved: order.status === 'approved' || order.status === 'printing' || order.status === 'shipped'
  });
});

// =====================
// POST /api/orders/:orderId/approve — Customer approves preview, trigger payment + printing
// =====================
app.post('/api/orders/:orderId/approve', async (req, res) => {
  try {
    const order = orders.get(req.params.orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'awaiting_approval') {
      return res.status(400).json({ error: `Order cannot be approved — current status: ${order.status}` });
    }

    // Capture the Stripe payment
    console.log(`[Server] Capturing payment for order ${order.id}...`);
    await getStripe().paymentIntents.capture(order.stripePaymentIntentId);
    order.status = 'payment_captured';

    // Upload PDF to Book Vault + create print order
    console.log(`[Server] Submitting to Book Vault...`);
    const book = loadBook(order.bookId);
    const pdfFileId = await uploadPDFToBookVault(order.pdfPath, order.id);

    const bookVaultOrder = await createBookVaultOrder({
      orderId: order.id,
      bookId: order.bookId,
      format: order.format,
      pdfFileId,
      shippingAddress: req.body.shippingAddress || order.shippingAddress,
      customerName: order.customerName
    });

    order.status = 'printing';
    order.bookVaultOrderId = bookVaultOrder.bookVaultOrderId;
    order.trackingId = bookVaultOrder.trackingId;
    order.estimatedDelivery = bookVaultOrder.estimatedDelivery;

    // Send printing confirmation email
    await sendPrintingConfirmation({
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      childName: order.childName,
      orderId: order.id,
      estimatedDelivery: bookVaultOrder.estimatedDelivery
    });

    res.json({
      success: true,
      message: 'Order approved and sent to print!',
      trackingId: bookVaultOrder.trackingId,
      estimatedDelivery: bookVaultOrder.estimatedDelivery
    });

  } catch (err) {
    console.error('[Server] Approval error:', err);
    res.status(500).json({ error: 'Failed to process approval. Please contact support.' });
  }
});

// =====================
// GET /api/orders/:orderId/approve — Link from email (redirects to a success page)
// =====================
app.get('/api/orders/:orderId/approve', async (req, res) => {
  const order = orders.get(req.params.orderId);

  if (!order || order.status !== 'awaiting_approval') {
    return res.redirect(`${process.env.FRONTEND_URL || 'https://www.littlemelibrary.com'}?approval=invalid`);
  }

  // Auto-approve via GET link (from email button)
  try {
    await getStripe().paymentIntents.capture(order.stripePaymentIntentId);
    order.status = 'payment_captured';

    const book = loadBook(order.bookId);
    const pdfFileId = await uploadPDFToBookVault(order.pdfPath, order.id);
    const bookVaultOrder = await createBookVaultOrder({
      orderId: order.id,
      bookId: order.bookId,
      format: order.format,
      pdfFileId,
      shippingAddress: order.shippingAddress,
      customerName: order.customerName
    });

    order.status = 'printing';
    order.bookVaultOrderId = bookVaultOrder.bookVaultOrderId;

    await sendPrintingConfirmation({
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      childName: order.childName,
      orderId: order.id,
      estimatedDelivery: bookVaultOrder.estimatedDelivery
    });

    res.redirect(`${process.env.FRONTEND_URL || 'https://www.littlemelibrary.com'}?approval=success&order=${order.id}`);
  } catch (err) {
    console.error('[Server] GET approval error:', err);
    res.redirect(`${process.env.FRONTEND_URL || 'https://www.littlemelibrary.com'}?approval=error`);
  }
});

// =====================
// POST /api/webhooks/stripe — Handle Stripe webhook events
// =====================
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Stripe Webhook] Invalid signature:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.payment_failed':
      const failedIntent = event.data.object;
      const failedOrderId = failedIntent.metadata?.orderId;
      if (failedOrderId && orders.has(failedOrderId)) {
        orders.get(failedOrderId).status = 'payment_failed';
        console.log(`[Stripe] Payment failed for order ${failedOrderId}`);
      }
      break;

    case 'payment_intent.succeeded':
      console.log('[Stripe] PaymentIntent succeeded:', event.data.object.id);
      break;

    default:
      console.log(`[Stripe] Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// =====================
// ERROR HANDLING
// =====================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Photo is too large — maximum size is 10MB' });
    }
  }
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// =====================
// START SERVER
// =====================
app.listen(PORT, () => {
  console.log(`\n🌟 Little Me Library API running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;

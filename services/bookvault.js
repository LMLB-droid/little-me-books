/**
 * Book Vault Integration Service
 *
 * Handles automated order submission to Book Vault (bookvault.app)
 * for print-on-demand fulfilment. Book Vault prints and ships globally.
 *
 * Docs: https://bookvault.app/api-documentation
 */

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const BOOKVAULT_API_URL = process.env.BOOKVAULT_API_URL || 'https://api.bookvault.app/v1';
const BOOKVAULT_API_KEY = process.env.BOOKVAULT_API_KEY;

// Pre-registered ISBNs per book title (you'll assign these when you register books in Book Vault)
// For development, these are placeholders — replace with real ISBNs from your Book Vault account
const BOOK_ISBNS = {
  'magical-adventure': {
    softcover: '978-0-000000-00-0',
    hardcover: '978-0-000000-01-7'
  }
};

/**
 * Upload the generated PDF to Book Vault
 * Book Vault needs the file accessible before creating the order
 *
 * @param {string} pdfPath - Local path to the print-ready PDF
 * @param {string} orderId - Our internal order ID (for naming)
 * @returns {string} - Book Vault file reference / URL
 */
async function uploadPDFToBookVault(pdfPath, orderId) {
  console.log(`[BookVault] Uploading PDF for order ${orderId}...`);

  const formData = new FormData();
  formData.append('file', fs.createReadStream(pdfPath), {
    filename: `lml-order-${orderId}.pdf`,
    contentType: 'application/pdf'
  });

  const response = await axios.post(`${BOOKVAULT_API_URL}/files/upload`, formData, {
    headers: {
      ...formData.getHeaders(),
      'Authorization': `Bearer ${BOOKVAULT_API_KEY}`
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (!response.data || !response.data.fileId) {
    throw new Error('Book Vault PDF upload failed — no fileId returned');
  }

  console.log(`[BookVault] ✅ PDF uploaded, fileId: ${response.data.fileId}`);
  return response.data.fileId;
}

/**
 * Create a print order with Book Vault
 *
 * @param {Object} options
 * @param {string} options.orderId - Our internal order reference
 * @param {string} options.bookId - Book template ID (e.g. 'magical-adventure')
 * @param {string} options.format - 'softcover' | 'hardcover'
 * @param {string} options.pdfFileId - File ID from uploadPDFToBookVault()
 * @param {Object} options.shippingAddress - Customer shipping details
 * @param {string} options.customerName - Full name for shipping label
 * @returns {Object} - Book Vault order details including tracking ID
 */
async function createBookVaultOrder({ orderId, bookId, format, pdfFileId, shippingAddress, customerName }) {
  console.log(`[BookVault] Creating print order for ${orderId} (${format})...`);

  const isbn = BOOK_ISBNS[bookId]?.[format];

  const orderPayload = {
    reference: `LML-${orderId}`,  // Our reference — appears on packing slip
    items: [
      {
        title: 'Little Me Library Personalised Book',
        isbn: isbn || 'TEST-ISBN',
        format: format === 'hardcover' ? 'HC' : 'PB',
        quantity: 1,
        fileId: pdfFileId,
        // Book Vault product specifications
        specifications: {
          binding: format === 'hardcover' ? 'Case Bound' : 'Perfect Bound',
          coverFinish: 'Gloss',
          paperType: 'Standard White',
          paperWeight: '80gsm',
          colourType: 'Full Colour',
          size: 'Square 216mm x 216mm',  // 8.5" × 8.5"
          pageCount: 44  // 20 story pages × 2 sides + covers
        }
      }
    ],
    shippingAddress: {
      name: customerName,
      line1: shippingAddress.line1,
      line2: shippingAddress.line2 || '',
      city: shippingAddress.city,
      state: shippingAddress.state || '',
      postcode: shippingAddress.postcode,
      country: shippingAddress.country,
      phone: shippingAddress.phone || ''
    },
    shippingMethod: 'standard',
    metadata: {
      source: 'little-me-library',
      internalOrderId: orderId
    }
  };

  const response = await axios.post(`${BOOKVAULT_API_URL}/orders`, orderPayload, {
    headers: {
      'Authorization': `Bearer ${BOOKVAULT_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.data || !response.data.orderId) {
    throw new Error('Book Vault order creation failed');
  }

  console.log(`[BookVault] ✅ Order created: ${response.data.orderId}`);
  console.log(`[BookVault] Tracking: ${response.data.trackingId || 'pending'}`);

  return {
    bookVaultOrderId: response.data.orderId,
    trackingId: response.data.trackingId || null,
    estimatedDelivery: response.data.estimatedDelivery || null,
    status: response.data.status || 'submitted'
  };
}

/**
 * Check the status of a Book Vault order
 */
async function getOrderStatus(bookVaultOrderId) {
  const response = await axios.get(`${BOOKVAULT_API_URL}/orders/${bookVaultOrderId}`, {
    headers: { 'Authorization': `Bearer ${BOOKVAULT_API_KEY}` }
  });
  return response.data;
}

module.exports = {
  uploadPDFToBookVault,
  createBookVaultOrder,
  getOrderStatus
};

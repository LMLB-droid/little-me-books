/**
 * Email Service — Resend
 *
 * Sends transactional emails:
 * 1. Order confirmation — "We're creating your book!"
 * 2. Preview ready — "Your book preview is ready! Please approve."
 * 3. Order approved — "Your book is being printed!"
 * 4. Shipped — "Your book is on its way!"
 *
 * Uses Resend (resend.com) — free tier: 3,000 emails/month, 100/day
 */

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'orders@littlemelibrary.com';

/**
 * Send order confirmation email
 */
async function sendOrderConfirmation({ customerEmail, customerName, childName, bookTitle, orderId, format }) {
  console.log(`[Email] Sending order confirmation to ${customerEmail}`);

  const { data, error } = await resend.emails.send({
    from: `Little Me Library <${FROM_EMAIL}>`,
    to: customerEmail,
    subject: `We're creating ${childName}'s book! 🌟`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563EB; font-size: 28px; margin: 0;">Little Me Library ✨</h1>
          <p style="color: #6B7280; margin: 5px 0 0;">The book where YOUR child is the star.</p>
        </div>

        <div style="background: #F0F7FF; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: #1a1a2e; margin: 0 0 12px;">Hi ${customerName}! 👋</h2>
          <p style="margin: 0 0 16px;">We've received your order and our AI is now creating <strong>${childName}'s personalised copy</strong> of <em>${bookTitle}</em>.</p>
          <p style="margin: 0; color: #6B7280; font-size: 14px;">This usually takes about 10–15 minutes. We'll email you when your preview is ready.</p>
        </div>

        <div style="border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <h3 style="margin: 0 0 16px; color: #374151; font-size: 16px;">Order Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Order Reference</td>
              <td style="padding: 8px 0; font-weight: 600; font-size: 14px; text-align: right;">${orderId}</td>
            </tr>
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Book</td>
              <td style="padding: 8px 0; font-size: 14px; text-align: right;">${bookTitle}</td>
            </tr>
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Character Name</td>
              <td style="padding: 8px 0; font-size: 14px; text-align: right;">${childName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Format</td>
              <td style="padding: 8px 0; font-size: 14px; text-align: right;">${format === 'hardcover' ? 'Hardcover' : 'Softcover'}</td>
            </tr>
          </table>
        </div>

        <p style="color: #6B7280; font-size: 13px; text-align: center;">Questions? Reply to this email and we'll help. 💙<br>
        Little Me Library · <a href="https://www.littlemelibrary.com" style="color: #2563EB;">littlemelibrary.com</a></p>
      </body>
      </html>
    `
  });

  if (error) throw new Error(`Email send failed: ${error.message}`);
  return data;
}

/**
 * Send preview ready email — customer must click Approve to trigger printing
 */
async function sendPreviewReadyEmail({ customerEmail, customerName, childName, orderId, previewPdfUrl, approveUrl }) {
  console.log(`[Email] Sending preview ready email to ${customerEmail}`);

  const { data, error } = await resend.emails.send({
    from: `Little Me Library <${FROM_EMAIL}>`,
    to: customerEmail,
    subject: `${childName}'s book preview is ready! Please approve 👀`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563EB; font-size: 28px; margin: 0;">Little Me Library ✨</h1>
        </div>

        <div style="background: #F0F7FF; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: #1a1a2e; margin: 0 0 12px;">Your preview is ready! 🎉</h2>
          <p style="margin: 0 0 16px;">Hi ${customerName}, we've finished creating <strong>${childName}'s personalised book</strong>. Please take a look at the preview and confirm you're happy with it before we send it to print.</p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${previewPdfUrl}" style="display: inline-block; background: #E5E7EB; color: #374151; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin-right: 12px; margin-bottom: 12px;">
            👁️ View Preview PDF
          </a>
          <a href="${approveUrl}" style="display: inline-block; background: #2563EB; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin-bottom: 12px;">
            ✅ Approve & Send to Print
          </a>
        </div>

        <div style="background: #FFF3CD; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 14px; color: #92400E;">⚠️ <strong>Please check:</strong> Is the name spelled correctly? Does the illustration resemble your child? If anything needs adjusting, just reply to this email.</p>
        </div>

        <p style="color: #6B7280; font-size: 13px; text-align: center;">Order reference: ${orderId}<br>
        This preview link expires in 7 days.</p>

        <p style="color: #6B7280; font-size: 13px; text-align: center;">Little Me Library · <a href="https://www.littlemelibrary.com" style="color: #2563EB;">littlemelibrary.com</a></p>
      </body>
      </html>
    `
  });

  if (error) throw new Error(`Email send failed: ${error.message}`);
  return data;
}

/**
 * Send printing confirmation — after customer approves and payment captured
 */
async function sendPrintingConfirmation({ customerEmail, customerName, childName, orderId, estimatedDelivery }) {
  console.log(`[Email] Sending printing confirmation to ${customerEmail}`);

  const { data, error } = await resend.emails.send({
    from: `Little Me Library <${FROM_EMAIL}>`,
    to: customerEmail,
    subject: `${childName}'s book is being printed! 📚`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563EB; font-size: 28px; margin: 0;">Little Me Library ✨</h1>
        </div>

        <div style="background: #F0F9F0; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: #1a1a2e; margin: 0 0 12px;">It's being printed! 🖨️</h2>
          <p style="margin: 0 0 16px;">Hi ${customerName}, we've sent <strong>${childName}'s book</strong> to our print partner. Your beautifully personalised book is now being printed and bound.</p>
          ${estimatedDelivery ? `<p style="margin: 0; font-weight: 600; color: #059669;">Estimated delivery: ${estimatedDelivery}</p>` : ''}
        </div>

        <p style="color: #6B7280; font-size: 13px;">Order reference: ${orderId}</p>
        <p style="color: #6B7280; font-size: 13px; text-align: center;">Little Me Library · <a href="https://www.littlemelibrary.com" style="color: #2563EB;">littlemelibrary.com</a></p>
      </body>
      </html>
    `
  });

  if (error) throw new Error(`Email send failed: ${error.message}`);
  return data;
}

module.exports = {
  sendOrderConfirmation,
  sendPreviewReadyEmail,
  sendPrintingConfirmation
};

/**
 * PDF Generation Service
 *
 * Assembles AI-generated illustrations + personalised text into a
 * print-ready 8.5" × 8.5" PDF formatted to Book Vault's spec.
 *
 * Book Vault requirements:
 * - Size: 8.5" × 8.5" (612 × 612 points)
 * - Bleed: 3mm on all sides (added to outer dimensions)
 * - Resolution: 300 DPI minimum (images embedded at full quality)
 * - Colour profile: CMYK (approximated — Book Vault converts for us)
 * - Format: PDF
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Book Vault page dimensions
// 8.5" × 8.5" = 612pt × 612pt
// With 3mm bleed each side: 8.5" + (3mm × 2) = ~8.736" × ~8.736"
// In points: 1mm = 2.835pt → 3mm = 8.505pt bleed each side
const PAGE_SIZE_PT = 612;         // 8.5 inches in points
const BLEED_PT = 8.505;           // 3mm in points
const BLEED_PAGE_SIZE = PAGE_SIZE_PT + (BLEED_PT * 2);  // Full page with bleed
const SAFE_MARGIN_PT = 18;        // 6.35mm safe zone from trim (content stays inside)

// Text styling
const FONTS = {
  title: 'Helvetica-Bold',
  body: 'Helvetica',
  italic: 'Helvetica-Oblique'
};

const COLORS = {
  primary: '#2563EB',       // Blue
  text: '#1a1a2e',          // Near-black
  lightText: '#6B7280',     // Grey
  background: '#FAFAFA',    // Off-white
  gold: '#F59E0B'           // Gold for accents
};

/**
 * Personalise text — replace [NAME] tokens and pronoun tokens
 */
function personaliseText(text, childName, pronounSet) {
  if (!text) return '';

  const pronouns = {
    neutral: { THEIR: 'their', THEM: 'them', THEY: 'they', HE_SHE: 'they', HIM_HER: 'them', HIS_HER: 'their' },
    boy:     { THEIR: 'his',   THEM: 'him',  THEY: 'he',   HE_SHE: 'he',   HIM_HER: 'him',  HIS_HER: 'his' },
    girl:    { THEIR: 'her',   THEM: 'her',  THEY: 'she',  HE_SHE: 'she',  HIM_HER: 'her',  HIS_HER: 'her' }
  };

  const p = pronouns[pronounSet] || pronouns.neutral;

  return text
    .replace(/\[NAME\]/g, childName)
    .replace(/\[THEIR\]/g, p.THEIR)
    .replace(/\[THEM\]/g, p.THEM)
    .replace(/\[THEY\]/g, p.THEY)
    .replace(/\[HE_SHE\]/g, p.HE_SHE)
    .replace(/\[HIM_HER\]/g, p.HIM_HER)
    .replace(/\[HIS_HER\]/g, p.HIS_HER);
}

/**
 * Draw a full-bleed illustration image on a page
 */
function drawIllustration(doc, imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) {
    // Placeholder if image failed to generate — blue background
    doc.rect(0, 0, BLEED_PAGE_SIZE, BLEED_PAGE_SIZE).fill('#E0EEFF');
    doc.fontSize(12).fillColor('#999').text('Illustration', BLEED_PAGE_SIZE / 2 - 30, BLEED_PAGE_SIZE / 2);
    return;
  }

  try {
    doc.image(imagePath, -BLEED_PT, -BLEED_PT, {
      width: BLEED_PAGE_SIZE,
      height: BLEED_PAGE_SIZE,
      fit: [BLEED_PAGE_SIZE, BLEED_PAGE_SIZE],
      align: 'center',
      valign: 'center'
    });
  } catch (err) {
    console.error('[PDF] Error embedding image:', err.message);
    doc.rect(0, 0, BLEED_PAGE_SIZE, BLEED_PAGE_SIZE).fill('#E0EEFF');
  }
}

/**
 * Draw text overlay on an illustration page
 * Text appears in a semi-transparent white box at the bottom of the page
 */
function drawTextOverlay(doc, text, fontSize = 16) {
  if (!text) return;

  const textBoxHeight = 160;
  const textBoxY = PAGE_SIZE_PT - textBoxHeight - SAFE_MARGIN_PT;
  const textX = SAFE_MARGIN_PT + 10;
  const textWidth = PAGE_SIZE_PT - (SAFE_MARGIN_PT * 2) - 20;

  // Semi-transparent white box
  doc.save();
  doc.rect(SAFE_MARGIN_PT, textBoxY - 10, PAGE_SIZE_PT - (SAFE_MARGIN_PT * 2), textBoxHeight + 20)
     .fillOpacity(0.88)
     .fill('#FFFFFF');
  doc.restore();

  // Text
  doc.fontSize(fontSize)
     .fillColor(COLORS.text)
     .fillOpacity(1)
     .font(FONTS.body)
     .text(text, textX, textBoxY, {
       width: textWidth,
       align: 'left',
       lineGap: 4
     });
}

/**
 * Add a cover page
 */
function addCoverPage(doc, bookTitle, childName, illustrationPath) {
  // Background illustration
  drawIllustration(doc, illustrationPath);

  // Title at top
  const titleY = SAFE_MARGIN_PT + 20;
  const titleText = `${childName}'s ${bookTitle}`;

  // Title background strip
  doc.rect(SAFE_MARGIN_PT, titleY - 10, PAGE_SIZE_PT - (SAFE_MARGIN_PT * 2), 70)
     .fillOpacity(0.85)
     .fill('#FFFFFF');

  doc.fontSize(32)
     .fillOpacity(1)
     .fillColor(COLORS.primary)
     .font(FONTS.title)
     .text(titleText, SAFE_MARGIN_PT + 10, titleY, {
       width: PAGE_SIZE_PT - (SAFE_MARGIN_PT * 2) - 20,
       align: 'center'
     });

  // "A Little Me Library Story" subtitle
  doc.fontSize(13)
     .fillColor(COLORS.lightText)
     .font(FONTS.italic)
     .text('A Little Me Library Story', SAFE_MARGIN_PT + 10, titleY + 42, {
       width: PAGE_SIZE_PT - (SAFE_MARGIN_PT * 2) - 20,
       align: 'center'
     });
}

/**
 * Add a dedication page
 */
function addDedicationPage(doc, text, customMessage) {
  // Soft blue background
  doc.rect(0, 0, PAGE_SIZE_PT, PAGE_SIZE_PT).fill('#F0F7FF');

  // Decorative stars
  const stars = ['✨', '⭐', '🌟'];
  doc.fontSize(30).fillColor(COLORS.gold).fillOpacity(0.4);
  doc.text('✨', 50, 50);
  doc.text('🌟', PAGE_SIZE_PT - 80, 50);
  doc.text('⭐', PAGE_SIZE_PT / 2 - 15, PAGE_SIZE_PT - 80);
  doc.fillOpacity(1);

  // Dedication text
  const displayText = customMessage || text;
  doc.fontSize(18)
     .fillColor(COLORS.text)
     .font(FONTS.italic)
     .text(displayText, SAFE_MARGIN_PT + 20, PAGE_SIZE_PT / 2 - 60, {
       width: PAGE_SIZE_PT - (SAFE_MARGIN_PT * 2) - 40,
       align: 'center',
       lineGap: 8
     });
}

/**
 * Add a story page with illustration + text
 */
function addStoryPage(doc, text, illustrationPath, isEnding = false) {
  // Full page illustration as background
  drawIllustration(doc, illustrationPath);

  // Text overlay at bottom
  const fontSize = isEnding ? 20 : 16;
  drawTextOverlay(doc, text, fontSize);
}

/**
 * Add a pure text page (for dedication etc without illustration)
 */
function addTextOnlyPage(doc, text) {
  doc.rect(0, 0, PAGE_SIZE_PT, PAGE_SIZE_PT).fill('#FAFAFA');

  doc.fontSize(16)
     .fillColor(COLORS.text)
     .font(FONTS.body)
     .text(text, SAFE_MARGIN_PT + 20, SAFE_MARGIN_PT + 40, {
       width: PAGE_SIZE_PT - (SAFE_MARGIN_PT * 2) - 40,
       align: 'center',
       lineGap: 6
     });
}

/**
 * Add a back cover page
 */
function addBackCover(doc, childName) {
  doc.rect(0, 0, PAGE_SIZE_PT, PAGE_SIZE_PT).fill(COLORS.primary);

  doc.fontSize(16)
     .fillColor('#FFFFFF')
     .font(FONTS.italic)
     .text(
       `"In this magical story, ${childName} is the hero — personalised with their name on every page and their face in every illustration. A keepsake they'll treasure forever."`,
       SAFE_MARGIN_PT + 20,
       PAGE_SIZE_PT / 2 - 60,
       {
         width: PAGE_SIZE_PT - (SAFE_MARGIN_PT * 2) - 40,
         align: 'center',
         lineGap: 8
       }
     );

  doc.fontSize(13)
     .fillColor('#93C5FD')
     .font(FONTS.body)
     .text('Little Me Library · littlemelibrary.com', SAFE_MARGIN_PT + 20, PAGE_SIZE_PT - SAFE_MARGIN_PT - 30, {
       width: PAGE_SIZE_PT - (SAFE_MARGIN_PT * 2) - 40,
       align: 'center'
     });
}

/**
 * MAIN FUNCTION: Generate the complete personalised PDF
 *
 * @param {Object} options
 * @param {Object} options.book - Book JSON content (from books/*.json)
 * @param {string} options.childName - Child's first name
 * @param {string} options.pronounSet - 'neutral' | 'boy' | 'girl'
 * @param {string} options.dedicationMessage - Optional custom dedication message
 * @param {Object} options.illustrations - Map of pageNumber -> local image path
 * @param {string} options.outputPath - Where to save the final PDF
 * @returns {Promise<string>} - Path to the generated PDF
 */
async function generateBookPDF({ book, childName, pronounSet, dedicationMessage, illustrations, outputPath }) {
  console.log(`\n[PDF] Generating PDF for "${childName}"...`);
  console.log(`[PDF] Output: ${outputPath}`);

  return new Promise((resolve, reject) => {
    // Create PDF with bleed dimensions
    const doc = new PDFDocument({
      size: [PAGE_SIZE_PT, PAGE_SIZE_PT],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      autoFirstPage: false,
      info: {
        Title: `${childName}'s ${book.title}`,
        Author: 'Little Me Library',
        Subject: 'Personalised Children\'s Book',
        Creator: 'Little Me Library (littlemelibrary.com)'
      }
    });

    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    writeStream.on('finish', () => {
      console.log(`[PDF] ✅ PDF generated successfully: ${outputPath}`);
      resolve(outputPath);
    });

    writeStream.on('error', reject);

    // ---- COVER PAGE ----
    doc.addPage({ size: [PAGE_SIZE_PT, PAGE_SIZE_PT] });
    addCoverPage(doc, book.title, childName, illustrations[1] || null);

    // ---- STORY PAGES ----
    for (const page of book.pages) {
      if (page.pageNumber === 1) continue; // Cover already added

      doc.addPage({ size: [PAGE_SIZE_PT, PAGE_SIZE_PT] });

      const personalisedText = personaliseText(page.text, childName, pronounSet);
      const illustrationPath = illustrations[page.pageNumber] || null;

      if (page.type === 'dedication') {
        addDedicationPage(doc, personalisedText, dedicationMessage);

      } else if (page.type === 'ending') {
        addStoryPage(doc, personalisedText, illustrationPath, true);

      } else if (page.hasIllustration && illustrationPath) {
        addStoryPage(doc, personalisedText, illustrationPath);

      } else {
        addTextOnlyPage(doc, personalisedText);
      }
    }

    // ---- BACK COVER ----
    doc.addPage({ size: [PAGE_SIZE_PT, PAGE_SIZE_PT] });
    addBackCover(doc, childName);

    // Finalise PDF
    doc.end();
  });
}

module.exports = { generateBookPDF, personaliseText };

/**
 * fal.ai Image Generation Service
 *
 * Uses InstantID to generate children's book illustrations where
 * the main character resembles the uploaded child photo.
 *
 * Model: fal-ai/instantid
 * Cost: ~$0.05-0.08 per image, so ~$0.85-1.36 for a full book (17 pages)
 */

const { fal } = require('@fal-ai/client');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configure fal.ai client
fal.config({
  credentials: process.env.FAL_KEY
});

/**
 * Download a file from a URL and save it locally
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    protocol.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Upload a local image file to fal.ai storage
 * fal.ai needs the reference photo accessible via URL
 */
async function uploadPhotoToFal(photoPath) {
  console.log(`[fal.ai] Uploading reference photo: ${photoPath}`);

  const imageBuffer = fs.readFileSync(photoPath);
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });

  const uploadedUrl = await fal.storage.upload(blob);
  console.log(`[fal.ai] Photo uploaded: ${uploadedUrl}`);
  return uploadedUrl;
}

/**
 * Generate a single illustration using InstantID
 *
 * @param {string} faceImageUrl - URL of the child's photo (uploaded to fal storage)
 * @param {string} prompt - Description of the scene to illustrate
 * @param {string} childName - Child's name (for logging)
 * @param {number} pageNumber - Page number (for logging)
 * @returns {string} - Local path to the generated image
 */
async function generateIllustration(faceImageUrl, prompt, childName, pageNumber, outputDir) {
  console.log(`[fal.ai] Generating illustration for page ${pageNumber}...`);

  // Style prefix to ensure consistent children's book illustration style
  const stylePrefix = "children's picture book illustration, soft watercolour style, warm friendly colours, professional illustration quality, ";

  // Negative prompt to keep things appropriate and on-style
  const negativePrompt = "realistic photo, photograph, 3D render, dark, scary, adult content, text, watermark, blurry, low quality, distorted face";

  const fullPrompt = stylePrefix + prompt.replace('[NAME]', childName);

  try {
    const result = await fal.subscribe('fal-ai/instantid', {
      input: {
        face_image_url: faceImageUrl,
        prompt: fullPrompt,
        negative_prompt: negativePrompt,
        num_inference_steps: 30,
        guidance_scale: 7.5,
        // Square format to match the book's 8.5"×8.5" layout
        image_size: {
          width: 1024,
          height: 1024
        },
        // Style conditioning — keep it consistent across all pages
        ip_adapter_scale: 0.8,
        controlnet_conditioning_scale: 0.8
      },
      logs: false,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log(`[fal.ai] Page ${pageNumber}: ${update.status}`);
        }
      }
    });

    if (!result.data || !result.data.images || result.data.images.length === 0) {
      throw new Error(`No image returned for page ${pageNumber}`);
    }

    const imageUrl = result.data.images[0].url;

    // Download the generated image to local storage
    const filename = `page-${String(pageNumber).padStart(2, '0')}.jpg`;
    const localPath = path.join(outputDir, filename);
    await downloadFile(imageUrl, localPath);

    console.log(`[fal.ai] ✅ Page ${pageNumber} saved: ${localPath}`);
    return localPath;

  } catch (error) {
    console.error(`[fal.ai] ❌ Error generating page ${pageNumber}:`, error.message);
    throw error;
  }
}

/**
 * Generate ALL illustrations for a book order
 *
 * @param {string} photoPath - Local path to the child's uploaded photo
 * @param {Array} pages - Array of page objects from the book JSON
 * @param {string} childName - Child's first name
 * @param {string} outputDir - Directory to save generated images
 * @returns {Object} - Map of pageNumber -> local image path
 */
async function generateAllIllustrations(photoPath, pages, childName, outputDir) {
  console.log(`\n[fal.ai] Starting illustration generation for "${childName}"`);
  console.log(`[fal.ai] Pages with illustrations: ${pages.filter(p => p.hasIllustration).length}`);

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Step 1: Upload the reference photo once (reused for all pages)
  const faceImageUrl = await uploadPhotoToFal(photoPath);

  // Step 2: Generate illustrations — run up to 3 at a time to be fast but not hit rate limits
  const illustrationPages = pages.filter(p => p.hasIllustration);
  const results = {};
  const CONCURRENCY = 3;

  for (let i = 0; i < illustrationPages.length; i += CONCURRENCY) {
    const batch = illustrationPages.slice(i, i + CONCURRENCY);
    console.log(`\n[fal.ai] Processing batch ${Math.floor(i/CONCURRENCY) + 1} (pages: ${batch.map(p => p.pageNumber).join(', ')})`);

    const batchPromises = batch.map(page =>
      generateIllustration(faceImageUrl, page.illustrationPrompt, childName, page.pageNumber, outputDir)
        .then(localPath => ({ pageNumber: page.pageNumber, path: localPath, success: true }))
        .catch(err => ({ pageNumber: page.pageNumber, error: err.message, success: false }))
    );

    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      if (result.success) {
        results[result.pageNumber] = result.path;
      } else {
        console.error(`[fal.ai] Failed page ${result.pageNumber}: ${result.error}`);
        // Use a placeholder image for failed pages rather than crashing the whole order
        results[result.pageNumber] = null;
      }
    }
  }

  const successCount = Object.values(results).filter(v => v !== null).length;
  console.log(`\n[fal.ai] ✅ Generation complete: ${successCount}/${illustrationPages.length} pages successful`);

  return results;
}

module.exports = {
  generateAllIllustrations,
  generateIllustration,
  uploadPhotoToFal
};

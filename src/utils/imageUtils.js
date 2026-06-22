import {
  getAiPerformanceNow,
  getBase64PayloadSizeKb,
  logAiPerformance
} from './aiPerformance.js';

export const AI_FOOD_IMAGE_MAX_SIDE = 1024;
export const AI_FOOD_IMAGE_JPEG_QUALITY = 0.76;

/**
 * Downscales an image to maxSide on the longest edge and converts it to JPEG.
 * Returns raw base64 without the data: prefix.
 */
export async function downscaleImageToBase64(base64OrDataUrl, maxSide = 1280, quality = 0.82) {
  const startedAt = getAiPerformanceNow();
  const originalSizeKb = getBase64PayloadSizeKb(base64OrDataUrl);
  const dataUrl = base64OrDataUrl.startsWith('data:')
    ? base64OrDataUrl
    : `data:image/jpeg;base64,${base64OrDataUrl}`;

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не вдалося прочитати зображення.'));
    image.src = dataUrl;
  });

  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (scale === 1 && dataUrl.includes('image/jpeg')) {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    logAiPerformance('image preprocessing', startedAt, {
      originalSizeKb,
      outputSizeKb: getBase64PayloadSizeKb(base64),
      width: img.width,
      height: img.height,
      maxSide,
      quality,
      reusedInput: true
    });
    return base64;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

  const outputBase64 = canvas.toDataURL('image/jpeg', quality).replace(/^data:image\/\w+;base64,/, '');
  logAiPerformance('image preprocessing', startedAt, {
    originalSizeKb,
    outputSizeKb: getBase64PayloadSizeKb(outputBase64),
    width: canvas.width,
    height: canvas.height,
    maxSide,
    quality,
    reusedInput: false
  });

  return outputBase64;
}

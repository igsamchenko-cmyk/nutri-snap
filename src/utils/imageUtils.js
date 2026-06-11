/**
 * Downscales an image to maxSide on the longest edge and converts it to JPEG.
 * Returns raw base64 without the data: prefix.
 */
export async function downscaleImageToBase64(base64OrDataUrl, maxSide = 1280, quality = 0.82) {
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
    return dataUrl.replace(/^data:image\/\w+;base64,/, '');
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', quality).replace(/^data:image\/\w+;base64,/, '');
}

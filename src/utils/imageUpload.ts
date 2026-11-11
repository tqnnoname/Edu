/**
 * Tiện ích xử lý tải tệp hình ảnh cho đề bài và đáp án.
 * Tự động tối ưu hóa và nén ảnh (canvas resize) để chống quá tải bộ nhớ và localStorage.
 */

export async function processImageFile(
  file: File,
  maxDimension: number = 1200,
  quality: number = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Vui lòng chọn một tệp hình ảnh hợp lệ (PNG, JPG, WEBP, GIF...).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc tệp hình ảnh.'));
    reader.onload = () => {
      const dataUrl = reader.result as string;

      // Nếu là ảnh SVG hoặc ảnh nhỏ hơn 120KB thì giữ nguyên
      if (file.type.includes('svg') || file.size < 120 * 1024) {
        resolve(dataUrl);
        return;
      }

      // Dùng Canvas để nén và co kích thước nếu quá lớn
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        let { width, height } = img;

        if (width <= maxDimension && height <= maxDimension && file.size < 350 * 1024) {
          resolve(dataUrl);
          return;
        }

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        // Vẽ ảnh lên canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Giữ PNG nếu có alpha hoặc dùng JPEG
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        try {
          const compressed = canvas.toDataURL(outputType, quality);
          resolve(compressed);
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

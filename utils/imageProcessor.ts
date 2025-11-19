import { DetectedTextRegion } from '../services/geminiService';

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

/**
 * Resizes an image file to a maximum dimension to optimize API payload size.
 * Switches to WebP format for superior compression on text documents.
 * Reduced to 1280px for faster inference while maintaining OCR legibility.
 */
export const resizeImageForApi = (file: File, maxDimension: number = 1280): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      // Use white background for transparent PNGs converted to WebP
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      
      ctx.drawImage(img, 0, 0, width, height);
      
      let dataUrl = canvas.toDataURL('image/webp', 0.8);
      if (dataUrl.startsWith('data:image/png')) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      }
      
      resolve(dataUrl);
    };
    img.onerror = (err) => reject(err);
    img.src = URL.createObjectURL(file);
  });
};

const getLuminance = (r: number, g: number, b: number) => {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  // If text has no spaces (e.g. Chinese), split by char to allow wrapping
  const hasSpaces = text.includes(' ');
  const words = hasSpaces ? text.split(' ') : text.split('');
  
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    // For CJK, don't add space between chars
    const separator = hasSpaces ? " " : "";
    const width = ctx.measureText(currentLine + separator + word).width;
    if (width < maxWidth) {
      currentLine += separator + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
};

/**
 * Calculates optimal font size, handling weight and line height dynamically
 * to maximize legibility in small spaces.
 */
const calculateOptimalFontSize = (
  ctx: CanvasRenderingContext2D, 
  text: string, 
  maxWidth: number, 
  maxHeight: number
): { size: number, lines: string[], lineHeight: number, weight: string } => {
    let minFs = 4; // Absolute minimum
    let maxFs = 120; // Upper bound for binary search
    
    let optimal = {
        size: minFs,
        lines: [text],
        lineHeight: minFs,
        weight: 'normal'
    };

    if (!text || text.length === 0) return optimal;

    // Binary search
    let low = minFs;
    let high = maxFs;

    while (low <= high) {
        const midFs = Math.floor((low + high) / 2);
        // Use bold for larger text, normal for small text to prevent ink bleed
        const weight = midFs < 10 ? '500' : 'bold';
        ctx.font = `${weight} ${midFs}px Inter, sans-serif`;
        
        const lines = wrapText(ctx, text, maxWidth);
        
        // Dynamic line height: Tighter for small text, standard for large
        let lineHeightMultiplier = 1.3;
        if (midFs <= 8) lineHeightMultiplier = 1.05;
        else if (midFs <= 12) lineHeightMultiplier = 1.1;
        else if (midFs <= 18) lineHeightMultiplier = 1.2;

        const lineHeight = midFs * lineHeightMultiplier; 
        const totalTextHeight = lines.length * lineHeight;
        
        const maxLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);

        // Relaxed height check slightly (1.1) to allow minor overflow rather than drastic shrink
        if (totalTextHeight <= maxHeight * 1.05 && maxLineWidth <= maxWidth * 1.05) {
            optimal = { size: midFs, lines, lineHeight, weight };
            low = midFs + 1; 
        } else {
            high = midFs - 1; 
        }
    }
    return optimal;
};

const getRegionVisuals = (
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    w: number, 
    h: number,
    imgWidth: number,
    imgHeight: number
) => {
    if (w <= 0 || h <= 0) return { bgColor: '#FFFFFF', inkColor: '#000000', bgLum: 255 };

    const sx = Math.min(Math.max(Math.floor(x), 0), imgWidth - 1);
    const sy = Math.min(Math.max(Math.floor(y), 0), imgHeight - 1);
    const sw = Math.min(Math.floor(w), imgWidth - sx);
    const sh = Math.min(Math.floor(h), imgHeight - sy);

    if (sw <= 0 || sh <= 0) return { bgColor: '#FFFFFF', inkColor: '#000000', bgLum: 255 };

    const imageData = ctx.getImageData(sx, sy, sw, sh).data;
    
    const samples = [];
    // Sample corners and centers and random points for better distribution
    const points = [
        0, 
        (sw - 1) * 4, 
        (sh - 1) * sw * 4, 
        ((sh - 1) * sw + (sw - 1)) * 4, 
        (Math.floor(sh/2) * sw + Math.floor(sw/2)) * 4,
        (Math.floor(sh/3) * sw + Math.floor(sw/3)) * 4,
        (Math.floor(sh*2/3) * sw + Math.floor(sw*2/3)) * 4
    ];

    for (const p of points) {
        if (p < imageData.length - 3) {
            samples.push({
                r: imageData[p],
                g: imageData[p+1],
                b: imageData[p+2],
                lum: getLuminance(imageData[p], imageData[p+1], imageData[p+2])
            });
        }
    }

    // Use Median Luminance to avoid picking up noise or highlights/shadows
    samples.sort((a, b) => a.lum - b.lum);
    const bgSample = samples.length > 0 ? samples[Math.floor(samples.length / 2)] : { r: 255, g: 255, b: 255, lum: 255 };
    
    let bgColor = `rgb(${bgSample.r}, ${bgSample.g}, ${bgSample.b})`;
    
    // Note: Removed the aggressive snap to #FFFFFF. 
    // We now trust the median sample to match paper texture (cream, grey, etc)

    // Determine Ink Color
    let maxDiff = 0;
    let inkCandidate = { r: 0, g: 0, b: 0 };
    // Stride 50 for speed optimization
    const step = Math.max(1, Math.floor(imageData.length / 4 / 50)); 

    for (let i = 0; i < imageData.length; i += 4 * step) {
        const r = imageData[i];
        const g = imageData[i+1];
        const b = imageData[i+2];
        const diff = Math.abs(r - bgSample.r) + Math.abs(g - bgSample.g) + Math.abs(b - bgSample.b);
        if (diff > maxDiff) {
            maxDiff = diff;
            inkCandidate = { r, g, b };
        }
    }

    const isColored = (Math.abs(inkCandidate.r - inkCandidate.g) > 30 || Math.abs(inkCandidate.b - inkCandidate.g) > 30);
    let inkColor = '#000000';
    
    if (isColored && maxDiff > 100) {
         inkColor = `rgb(${inkCandidate.r}, ${inkCandidate.g}, ${inkCandidate.b})`;
    } 
    else if (bgSample.lum < 50) {
         // Dark background -> White Text
         inkColor = '#FFFFFF';
    }

    return { bgColor, inkColor, bgLum: bgSample.lum };
};

/**
 * Scans the region to find the tightest bounding box containing non-background pixels (ink).
 * Used for "Freestyle Mode" to erase only text in open spaces.
 */
const getInkBoundingBox = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    bgLum: number
) => {
    const sx = Math.floor(x);
    const sy = Math.floor(y);
    const sw = Math.floor(w);
    const sh = Math.floor(h);

    if (sw <= 0 || sh <= 0) return { x, y, w, h };

    const imageData = ctx.getImageData(sx, sy, sw, sh);
    const data = imageData.data;
    
    let minX = sw, minY = sh, maxX = 0, maxY = 0;
    let found = false;

    // Stride 2 for performance
    for (let py = 0; py < sh; py += 2) {
        for (let px = 0; px < sw; px += 2) {
            const idx = (py * sw + px) * 4;
            const r = data[idx];
            const g = data[idx+1];
            const b = data[idx+2];
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            // If pixel differs significantly from background luminance
            if (Math.abs(lum - bgLum) > 40) {
                if (px < minX) minX = px;
                if (px > maxX) maxX = px;
                if (py < minY) minY = py;
                if (py > maxY) maxY = py;
                found = true;
            }
        }
    }

    if (!found) return { x, y, w, h };

    // Add a small padding
    const pad = 2;
    return {
        x: sx + Math.max(0, minX - pad),
        y: sy + Math.max(0, minY - pad),
        w: Math.min(sw, (maxX - minX) + pad * 2),
        h: Math.min(sh, (maxY - minY) + pad * 2)
    };
};

/**
 * Pixel-Peeping Algorithm:
 * Scans inward from the detected box edges to find the "true" cell boundaries
 * by stopping at dark pixels (grid lines).
 */
const refineBoxWithLineDetection = (
    ctx: CanvasRenderingContext2D,
    initialX: number,
    initialY: number,
    initialW: number,
    initialH: number,
    imgW: number,
    imgH: number
) => {
    const startX = Math.max(0, Math.min(Math.floor(initialX), imgW - 1));
    const startY = Math.max(0, Math.min(Math.floor(initialY), imgH - 1));
    const w = Math.max(1, Math.min(Math.floor(initialW), imgW - startX));
    const h = Math.max(1, Math.min(Math.floor(initialH), imgH - startY));

    if (w <= 1 || h <= 1) return { x: startX, y: startY, w: w, h: h, hitBorders: false };

    const imageData = ctx.getImageData(startX, startY, w, h);
    const data = imageData.data;
    const realW = imageData.width;
    const realH = imageData.height;

    const isDark = (idx: number) => {
        if (idx < 0 || idx >= data.length) return false;
        const r = data[idx];
        const g = data[idx+1];
        const b = data[idx+2];
        return (r + g + b) / 3 < 120; 
    };

    const maxShrinkX = Math.floor(realW * 0.15);
    const maxShrinkY = Math.floor(realH * 0.15);
    let hitBorders = false;

    // 1. Scan Left Edge Inwards
    let offsetLeft = 0;
    // Stride 4 for speed optimization
    while (offsetLeft < maxShrinkX) {
        let darkCount = 0;
        for(let y = 0; y < realH; y += 4) { 
             const idx = (y * realW + offsetLeft) * 4;
             if (isDark(idx)) darkCount++;
        }
        if (darkCount > realH * 0.3) { offsetLeft++; hitBorders = true; }
        else break; 
    }

    // 2. Scan Right Edge
    let offsetRight = 0;
    while (offsetRight < maxShrinkX) {
        let darkCount = 0;
        const x = realW - 1 - offsetRight;
        for(let y = 0; y < realH; y += 4) {
             const idx = (y * realW + x) * 4;
             if (isDark(idx)) darkCount++;
        }
        if (darkCount > realH * 0.3) { offsetRight++; hitBorders = true; }
        else break;
    }

    // 3. Scan Top Edge
    let offsetTop = 0;
    while (offsetTop < maxShrinkY) {
        let darkCount = 0;
        for(let x = 0; x < realW; x += 4) {
             const idx = (offsetTop * realW + x) * 4;
             if (isDark(idx)) darkCount++;
        }
        if (darkCount > realW * 0.3) { offsetTop++; hitBorders = true; }
        else break;
    }

    // 4. Scan Bottom Edge
    let offsetBottom = 0;
    while (offsetBottom < maxShrinkY) {
        let darkCount = 0;
        const y = realH - 1 - offsetBottom;
        for(let x = 0; x < realW; x += 4) {
             const idx = (y * realW + x) * 4;
             if (isDark(idx)) darkCount++;
        }
        if (darkCount > realW * 0.3) { offsetBottom++; hitBorders = true; }
        else break;
    }

    const safeXRaw = startX + offsetLeft + (offsetLeft > 0 ? 1 : 0);
    const safeYRaw = startY + offsetTop + (offsetTop > 0 ? 1 : 0);
    const safeWRaw = w - offsetLeft - offsetRight - (offsetLeft > 0 ? 1 : 0) - (offsetRight > 0 ? 1 : 0);
    const safeHRaw = h - offsetTop - offsetBottom - (offsetTop > 0 ? 1 : 0) - (offsetBottom > 0 ? 1 : 0);

    const safeX = Math.max(0, Math.min(safeXRaw, imgW - 1));
    const safeY = Math.max(0, Math.min(safeYRaw, imgH - 1));
    const safeW = Math.max(1, Math.min(safeWRaw, imgW - safeX));
    const safeH = Math.max(1, Math.min(safeHRaw, imgH - safeY));

    return { x: safeX, y: safeY, w: safeW, h: safeH, hitBorders };
};

export const renderTranslatedImage = async (imageSrc: string, regions: DetectedTextRegion[]): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject("Could not get canvas context");
        return;
      }

      ctx.drawImage(img, 0, 0);

      const maxAllowedFs = Math.max(16, img.width / 35);

      const calculatedRegions = regions.map(region => {
        const [ymin, xmin, ymax, xmax] = region.box_2d;
        const x = (xmin / 1000) * img.width;
        const y = (ymin / 1000) * img.height;
        const w = ((xmax - xmin) / 1000) * img.width;
        const h = ((ymax - ymin) / 1000) * img.height;

        // Detect if we are inside a strict table cell or floating text
        const safeBox = refineBoxWithLineDetection(ctx, x, y, w, h, img.width, img.height);
        
        return {
            original: region,
            pixelBox: { x, y, w, h },
            safeBox: safeBox,
        };
      });

      // Group by Rows
      const rows: typeof calculatedRegions[] = [];
      const sortedRegions = [...calculatedRegions].sort((a, b) => a.pixelBox.y - b.pixelBox.y);

      sortedRegions.forEach(region => {
          let added = false;
          for (const row of rows) {
              const anchor = row[0];
              const top = Math.max(region.pixelBox.y, anchor.pixelBox.y);
              const bottom = Math.min(region.pixelBox.y + region.pixelBox.h, anchor.pixelBox.y + anchor.pixelBox.h);
              const overlap = Math.max(0, bottom - top);
              const minHeight = Math.min(region.pixelBox.h, anchor.pixelBox.h);
              
              // Overlap threshold 50%
              if (overlap > minHeight * 0.5) {
                  row.push(region);
                  added = true;
                  break;
              }
          }
          if (!added) {
              rows.push([region]);
          }
      });

      rows.forEach(row => {
          // Calculate sizes for row alignment
          const optimizations = row.map(r => {
             // Use safeBox dimensions for sizing constraint
             const constraintTrans = calculateOptimalFontSize(ctx, r.original.translation, r.safeBox.w, r.safeBox.h);
             const constraintOriginal = calculateOptimalFontSize(ctx, r.original.text, r.safeBox.w, r.safeBox.h);
             
             const naturalSize = Math.min(constraintOriginal.size, constraintTrans.size);
             
             return {
                 ...constraintTrans, 
                 naturalSize: naturalSize
             };
          });

          const sizes = optimizations.map(o => o.naturalSize).sort((a, b) => a - b);
          const medianSize = sizes[Math.floor(sizes.length / 2)];
          let targetSize = Math.min(Math.max(medianSize, 8), maxAllowedFs);

          row.forEach((r, idx) => {
             const { hitBorders } = r.safeBox;
             
             // Re-scan visuals
             // If we hit borders (Table), use the refined box.
             // If we didn't (Free Text), use the original loose box to sample background context.
             const scanBox = hitBorders ? r.safeBox : r.pixelBox;
             const visuals = getRegionVisuals(ctx, scanBox.x, scanBox.y, scanBox.w, scanBox.h, img.width, img.height);

             // HYBRID LAYOUT LOGIC
             let drawBox: { x: number; y: number; w: number; h: number } = r.safeBox;
             
             if (!hitBorders) {
                 // Free Text Mode: Find the actual ink and only erase that to preserve art/whitespace
                 const inkBox = getInkBoundingBox(ctx, r.pixelBox.x, r.pixelBox.y, r.pixelBox.w, r.pixelBox.h, visuals.bgLum);
                 drawBox = inkBox;
             }

             ctx.save();
             ctx.beginPath();
             ctx.rect(drawBox.x, drawBox.y, drawBox.w, drawBox.h); 
             ctx.clip();

             // Fill with detected background color (Median of samples)
             ctx.fillStyle = visuals.bgColor;
             ctx.fillRect(drawBox.x, drawBox.y, drawBox.w, drawBox.h);

             const alignment = r.original.alignment || 'left';
             ctx.textAlign = alignment;
             ctx.textBaseline = 'top'; 
             
             // Allow exception if specific cell needs smaller font
             const myMax = optimizations[idx].size;
             let finalSize = Math.min(targetSize, myMax);
             
             // If individual size is drastically different (>30%) from median, allow it (Menu title vs price)
             if (Math.abs(myMax - targetSize) > targetSize * 0.3) {
                 finalSize = myMax;
             }

             const weight = finalSize < 10 ? '500' : 'bold';
             
             let lineHeightMultiplier = 1.3;
             if (finalSize <= 8) lineHeightMultiplier = 1.05;
             else if (finalSize <= 12) lineHeightMultiplier = 1.1;
             else if (finalSize <= 18) lineHeightMultiplier = 1.2;

             const lineHeight = finalSize * lineHeightMultiplier;

             ctx.font = `${weight} ${finalSize}px Inter, sans-serif`;
             ctx.fillStyle = visuals.inkColor;
             
             // Letter spacing for tiny text
             if (finalSize < 10) {
                 ctx.letterSpacing = "0.5px";
             } else {
                 ctx.letterSpacing = "0px";
             }

             const lines = wrapText(ctx, r.original.translation, drawBox.w);
             const totalHeight = lines.length * lineHeight;
             
             const startY = drawBox.y + (drawBox.h - totalHeight) / 2;

             let textX = drawBox.x;
             if (alignment === 'center') textX = drawBox.x + drawBox.w / 2;
             if (alignment === 'right') textX = drawBox.x + drawBox.w;

             lines.forEach((line, index) => {
                 ctx.fillText(line, textX, startY + (index * lineHeight));
             });

             ctx.restore();
          });
      });

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = imageSrc;
  });
};

export const generateMockTranslation = async (imageSrc: string): Promise<string> => {
    const fakeRegions: DetectedTextRegion[] = [
        { box_2d: [100, 100, 150, 300], text: "Item", translation: "Item No", confidence: 0.99, alignment: 'left' },
        { box_2d: [100, 300, 150, 700], text: "Desc", translation: "Description", confidence: 0.99, alignment: 'left' },
        { box_2d: [100, 700, 150, 900], text: "Qty", translation: "Qty", confidence: 0.99, alignment: 'right' }
    ];
    return renderTranslatedImage(imageSrc, fakeRegions);
};
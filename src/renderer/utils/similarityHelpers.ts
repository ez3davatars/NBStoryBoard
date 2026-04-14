/**
 * Helper utilities for comparing image similarity.
 * Used for detecting AI generation duplicates/trivial crops.
 */

export async function computeImageSimilarity(urlA: string, urlB: string): Promise<number> {
    const [imgA, imgB] = await Promise.all([loadImage(urlA), loadImage(urlB)]);
    
    // Scale both to a tiny size (e.g., 64x64) for robust structural/composition comparison
    const SIZE = 64;
    const canvasA = document.createElement('canvas');
    const canvasB = document.createElement('canvas');
    canvasA.width = SIZE; canvasA.height = SIZE;
    canvasB.width = SIZE; canvasB.height = SIZE;
    
    const ctxA = canvasA.getContext('2d');
    const ctxB = canvasB.getContext('2d');
    
    if (!ctxA || !ctxB) return 0; // Fallback if canvas is unsupported
    
    ctxA.drawImage(imgA, 0, 0, SIZE, SIZE);
    ctxB.drawImage(imgB, 0, 0, SIZE, SIZE);
    
    const dataA = ctxA.getImageData(0, 0, SIZE, SIZE).data;
    const dataB = ctxB.getImageData(0, 0, SIZE, SIZE).data;
    
    let sumSqrDiff = 0;
    for (let i = 0; i < dataA.length; i += 4) {
        const diffR = dataA[i] - dataB[i];
        const diffG = dataA[i+1] - dataB[i+1];
        const diffB = dataA[i+2] - dataB[i+2];
        sumSqrDiff += diffR * diffR + diffG * diffG + diffB * diffB;
    }
    
    const maxDiff = (255 * 255 * 3) * (SIZE * SIZE);
    const similarity = 1 - (sumSqrDiff / maxDiff);
    return similarity;
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

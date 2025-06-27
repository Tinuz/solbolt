/**
 * Utility functions for image handling and validation
 */

export function getValidImageUrl(imageUrl: string | undefined | null, fallbackSymbol: string): string {
  // Check if image URL is valid and not empty
  if (imageUrl && imageUrl.trim() !== '' && isValidUrl(imageUrl)) {
    return imageUrl;
  }
  
  // Return fallback image with first letter of symbol
  const firstLetter = fallbackSymbol.charAt(0).toUpperCase();
  return `https://via.placeholder.com/64x64/374151/9CA3AF?text=${firstLetter}`;
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function createFallbackImage(symbol: string, size: number = 64): string {
  const firstLetter = symbol.charAt(0).toUpperCase();
  return `https://via.placeholder.com/${size}x${size}/374151/9CA3AF?text=${firstLetter}`;
}

export function hasMediaText(value?: string | null) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isImageMediaUrl(url: string) {
  const lowered = url.trim().toLowerCase();
  if (/\.(jpe?g|png|gif|webp|avif|heic|bmp)(\?|#|$)/i.test(lowered)) return true;
  if (/(unsplash|cloudinary|imgur|images\.)/i.test(lowered) && !/youtube|youtu\.be|vimeo/i.test(lowered)) return true;
  return false;
}

export function isYoutubeUrl(url: string) {
  return /youtube\.com|youtu\.be/i.test(url);
}

export function isVimeoUrl(url: string) {
  return /vimeo\.com/i.test(url);
}

export function isVideoMediaUrl(url: string) {
  const lowered = url.trim().toLowerCase();
  if (isYoutubeUrl(lowered) || isVimeoUrl(lowered)) return true;
  return /\.(mp4|webm|mov|m3u8)(\?|#|$)/i.test(lowered);
}

export function youtubeEmbedUrl(url: string) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&?/]+)/i);
  const id = match?.[1];
  return id ? `https://www.youtube.com/embed/${id}?autoplay=0&playsinline=1&rel=0` : url.trim();
}

export function vimeoEmbedUrl(url: string) {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  const id = match?.[1];
  return id ? `https://player.vimeo.com/video/${id}?autoplay=0` : url.trim();
}

export function embeddableMediaUrl(url: string) {
  const trimmed = url.trim();
  if (isYoutubeUrl(trimmed)) return youtubeEmbedUrl(trimmed);
  if (isVimeoUrl(trimmed)) return vimeoEmbedUrl(trimmed);
  return trimmed;
}

export function virtualTourUrl(media?: { tour3dUrl?: string; videoUrl?: string }) {
  const tour = media?.tour3dUrl?.trim();
  if (tour) return tour;
  const video = media?.videoUrl?.trim();
  if (video && (isYoutubeUrl(video) || isVimeoUrl(video) || /matterport|kuula|roundme|cloudpano|3d|360|tour/i.test(video))) {
    return video;
  }
  return null;
}

export function aerialDroneUrl(media?: { droneImageUrl?: string; videoUrl?: string }) {
  const drone = media?.droneImageUrl?.trim();
  if (drone) return drone;
  const video = media?.videoUrl?.trim();
  if (video) return video;
  return null;
}

export function hasVirtualTour(media?: { tour3dUrl?: string; videoUrl?: string }) {
  return !!virtualTourUrl(media);
}

export function hasAerialContent(
  media?: { droneImageUrl?: string; videoUrl?: string },
  coordinates?: { latitude: number; longitude: number } | null,
) {
  return !!aerialDroneUrl(media) || !!coordinates;
}

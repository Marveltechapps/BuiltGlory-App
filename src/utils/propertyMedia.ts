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

export function virtualTourUrl(media?: { tour3dUrl?: string }) {
  const tour = media?.tour3dUrl?.trim();
  return tour || null;
}

export function aerialDroneUrl(media?: { droneImageUrl?: string; droneVideoUrl?: string }) {
  const droneVideo = media?.droneVideoUrl?.trim();
  if (droneVideo) return droneVideo;
  const drone = media?.droneImageUrl?.trim();
  if (drone) return drone;
  return null;
}

export function hasVirtualTour(media?: { tour3dUrl?: string }) {
  return !!virtualTourUrl(media);
}

export function hasAerialContent(media?: { droneImageUrl?: string; droneVideoUrl?: string }) {
  return !!aerialDroneUrl(media);
}

/** Collect floor-plan image URLs from property media (supports comma/newline lists). */
export function propertyFloorPlanUrls(media?: {
  floorPlanUrl?: string;
  floorPlanUrls?: string[];
} | null) {
  const collected: string[] = [];
  const push = (value?: string | null) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) return;
    trimmed.split(/[\n,|]+/).forEach((part) => {
      const url = part.trim();
      if (url && !collected.includes(url)) collected.push(url);
    });
  };
  if (Array.isArray(media?.floorPlanUrls)) {
    media.floorPlanUrls.forEach((url) => push(url));
  }
  push(media?.floorPlanUrl);
  return collected;
}

export function propertyFloorPlans(media?: {
  floorPlanUrl?: string;
  floorPlanUrls?: string[];
} | null) {
  return propertyFloorPlanUrls(media).map((url, index) => ({
    url,
    label: `Plan ${index + 1}`,
  }));
}

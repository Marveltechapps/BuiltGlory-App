import { formatINR, formatPropertyTypeLabel } from '../data/data';
import type { CustomerProperty } from '../api/customer';

export type SpecRow = { label: string; value: string };

const KNOWN_SPEC_LABELS: Record<string, string> = {
  bhk: 'Bedrooms / BHK',
  bhkConfig: 'BHK configuration',
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  washrooms: 'Washrooms',
  washroomsCount: 'Washrooms',
  builtUpArea: 'Built-up area',
  builtUp: 'Built-up area',
  superBuiltUp: 'Super built-up area',
  carpetArea: 'Carpet area',
  plotArea: 'Plot area',
  landArea: 'Land area',
  totalArea: 'Total area',
  floor: 'Floor',
  floorNumber: 'Floor',
  floors: 'Floors',
  totalFloors: 'Total floors',
  facing: 'Facing',
  age: 'Property age',
  propertyAge: 'Property age',
  constructionYear: 'Construction year',
  furnishing: 'Furnishing',
  parking: 'Parking',
  parkingType: 'Parking type',
  parkingSlots: 'Parking slots',
  parkingCount: 'Parking',
  reraNumber: 'RERA number',
  possession: 'Possession',
  possessionStatus: 'Possession',
  transactionType: 'Transaction type',
  vastuCompliant: 'Vastu compliant',
  builderName: 'Builder',
  projectName: 'Project',
  towerName: 'Tower',
  unitNumber: 'Unit number',
  balcony: 'Balconies',
  balconies: 'Balconies',
  maintenancePerMonth: 'Maintenance / month',
  monthlyMaintenance: 'Maintenance / month',
  pricePerSqft: 'Price per sqft',
  roadWidth: 'Road width',
  approvalType: 'Approval',
  titleType: 'Title type',
  ocStatus: 'OC status',
  waterSource: 'Water source',
  powerLoad: 'Power load',
  ownershipType: 'Ownership',
};

const SKIP_SPEC_KEYS = new Set([
  'virtualTourUrl',
  'virtualTourAvailable',
  'poaHolderPhone',
  'poaHolderEmail',
  'poaHolderName',
]);

function hasValue(value: unknown) {
  if (value == null) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim().length > 0 && String(value).trim() !== '—';
}

function humanizeKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSpecValue(key: string, value: unknown) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(', ');
  const text = String(value).trim();
  if (/area|sqft|builtup|carpet|plot/i.test(key) && /^\d+(\.\d+)?$/.test(text)) {
    return `${Number(text).toLocaleString('en-IN')} sqft`;
  }
  if (/price|maintenance|charges/i.test(key) && /^\d+(\.\d+)?$/.test(text)) {
    return formatINR(Number(text));
  }
  if (/parking|floor|bedroom|bathroom|washroom|balcony|bhk/i.test(key) && /^\d+(\.\d+)?$/.test(text)) {
    return text;
  }
  return text;
}

export function propertySpecRows(property?: CustomerProperty | null, fallback?: {
  price?: number;
  type?: string;
  location?: string;
  city?: string;
  area?: number;
  bhk?: number;
  floor?: string;
}): SpecRow[] {
  const specs = (property?.specs ?? {}) as Record<string, unknown>;
  const rows: SpecRow[] = [];
  const seen = new Set<string>();

  const push = (label: string, value: unknown, key?: string) => {
    if (!hasValue(value)) return;
    const formatted = formatSpecValue(key || label, value);
    if (!formatted) return;
    const dedupe = label.toLowerCase();
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    rows.push({ label, value: formatted });
  };

  push('Price', property?.price ?? fallback?.price, 'price');
  push('Property type', formatPropertyTypeLabel(property?.type ?? fallback?.type));
  const location = [property?.address?.locality ?? fallback?.location, property?.address?.city ?? fallback?.city]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(', ');
  push('Location', location);

  const orderedKeys = Object.keys(KNOWN_SPEC_LABELS);
  orderedKeys.forEach((key) => {
    push(KNOWN_SPEC_LABELS[key], specs[key], key);
  });

  if (!seen.has('bedrooms / bhk') && fallback?.bhk) push('Bedrooms / BHK', fallback.bhk, 'bhk');
  if (!seen.has('built-up area') && fallback?.area) push('Area', fallback.area, 'builtUpArea');
  if (!seen.has('floor') && fallback?.floor) push('Floor', fallback.floor, 'floor');

  Object.entries(specs).forEach(([key, value]) => {
    if (SKIP_SPEC_KEYS.has(key) || key in KNOWN_SPEC_LABELS) return;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return;
    push(KNOWN_SPEC_LABELS[key] || humanizeKey(key), value, key);
  });

  return rows;
}

export function propertyAmenityLabels(property?: CustomerProperty | null, fallback: string[] = []) {
  const fromBackend = (property?.amenities ?? []).map((item) => String(item).trim()).filter(Boolean);
  if (fromBackend.length) return Array.from(new Set(fromBackend));
  return fallback.filter(Boolean);
}

export function propertyHighlightLabels(property?: CustomerProperty | null) {
  return (property?.highlights ?? []).map((item) => String(item).trim()).filter(Boolean);
}

import { useRef } from 'react';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { ScrollView } from 'react-native';
import type { SellRequest } from '../api/customer';

export const SELL_LIMITS = {
  titleMin: 8,
  titleMax: 200,
  streetMin: 3,
  streetMax: 120,
  localityMin: 2,
  localityMax: 80,
  cityMin: 2,
  cityMax: 80,
  pinLength: 6,
  areaMin: 50,
  areaMax: 1_000_000,
  priceMin: 50_000,
  priceMax: 50_000_000_000,
  floorMin: -5,
  floorMax: 200,
  totalFloorsMin: 1,
  totalFloorsMax: 200,
  parkingMin: 0,
  parkingMax: 50,
  descriptionMax: 5000,
  descriptionMinIfPresent: 20,
  unitNoMax: 40,
  furnishDetailsMin: 8,
  furnishDetailsMax: 500,
  loanLenderMin: 2,
  loanLenderMax: 80,
  photosMin: 5,
  photosMax: 30,
  photoMaxBytes: 25 * 1024 * 1024,
  documentMaxBytes: 25 * 1024 * 1024,
  amenityMin: 1,
  reraMax: 40,
  roadWidthMin: 3,
  roadWidthMax: 200,
  sharePercentMin: 0.01,
  sharePercentMax: 100,
  textShortMin: 2,
  textShortMax: 80,
  textLongMax: 500,
} as const;

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'] as const;

export const BHK_OPTIONS = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '5+ BHK', 'Studio'] as const;
export const AGE_OPTIONS = ['Under Construction', '0–1 year', '1–5 years', '5–10 years', '10+ years'] as const;
export const FACING_OPTIONS = ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'] as const;
export const OWNERSHIP_OPTIONS = ['Freehold', 'Leasehold', 'Co-op', 'Power of Attorney'] as const;
export const FURNISH_OPTIONS = ['Unfurnished', 'Semi-Furnished', 'Furnished'] as const;
export const PARKING_TYPE_OPTIONS = ['Covered', 'Open', 'Both'] as const;
export const POSSESSION_OPTIONS = ['Ready to move', 'Under Construction', 'In 3 months', 'In 6 months', 'In 1 year'] as const;
export const COMMERCIAL_TYPE_OPTIONS = ['Shop', 'Office', 'Showroom', 'Clinic', 'Warehouse', 'Other'] as const;
export const PLOT_APPROVAL_OPTIONS = ['DTCP', 'CMDA', 'BDA', 'Panchayat', 'None'] as const;
export const LEGAL_STRUCTURE_OPTIONS = ['LLP', 'Private Limited', 'Trust', 'AOP', 'Individual'] as const;
export const INTERIOR_SCOPE_OPTIONS = ['Full home', 'Kitchen only', 'Living + kitchen', 'Office interior', 'Custom'] as const;

export const APARTMENT_SUB_TYPES = [
  'Residential Apartment',
  'Builder Floor',
  'Penthouse',
  'Studio Apartment',
  'Service Apartment',
] as const;

export const RESIDENTIAL_SUB_TYPES = [
  'Independent House',
  'Villa',
  'Row House',
  'Duplex',
  'Builder Floor',
] as const;

export const COMMERCIAL_SUB_TYPES = ['Shop', 'Office', 'Showroom', 'Clinic'] as const;

export type SellFieldErrors = Record<string, string>;

export type SellTypeCategory =
  | 'plot'
  | 'land'
  | 'apartment'
  | 'residential'
  | 'commercial'
  | 'fractional'
  | 'interior'
  | 'nri'
  | 'other';

export type SellFieldVisibility = {
  subType: boolean;
  bhk: boolean;
  builtUp: boolean;
  plotArea: boolean;
  floor: boolean;
  totalFloors: boolean;
  unitNo: boolean;
  age: boolean;
  facing: boolean;
  ownership: boolean;
  furnishing: boolean;
  parking: boolean;
  possession: boolean;
  loan: boolean;
  description: boolean;
  commercialType: boolean;
  rera: boolean;
  plotExtras: boolean;
  nriFields: boolean;
  fractionalFields: boolean;
  interiorFields: boolean;
  amenitiesRequired: boolean;
};

const TYPE_ALIASES: Record<string, string> = {
  plot: 'plot',
  plots: 'plot',
  land: 'land',
  apartment: 'apartment',
  flat: 'apartment',
  flats: 'apartment',
  nri: 'nri',
  villa: 'villa',
  residential: 'residential',
  house: 'residential',
  farmhouse: 'farmhouse',
  farm: 'farmhouse',
  'ceo-mansion': 'ceo_mansion',
  ceo_mansion: 'ceo_mansion',
  ceo: 'ceo_mansion',
  organic: 'organic_home',
  organic_home: 'organic_home',
  holiday: 'holiday_home',
  holiday_home: 'holiday_home',
  '3d-print': '3d_printing',
  '3d_printing': '3d_printing',
  '3d_print': '3d_printing',
  commercial: 'commercial',
  fractional: 'fractional',
  interior: 'interior',
};

export function normalizeSellPropertyType(type?: string | null) {
  const key = String(type || '').trim().toLowerCase().replace(/[\s]+/g, '-');
  return TYPE_ALIASES[key] || TYPE_ALIASES[key.replace(/-/g, '_')] || key.replace(/-/g, '_');
}

export function sellTypeCategory(type?: string | null): SellTypeCategory {
  const normalized = normalizeSellPropertyType(type);
  if (normalized === 'plot') return 'plot';
  if (normalized === 'land') return 'land';
  if (normalized === 'apartment' || normalized === 'nri') return normalized === 'nri' ? 'nri' : 'apartment';
  if (normalized === 'commercial') return 'commercial';
  if (normalized === 'fractional') return 'fractional';
  if (normalized === 'interior') return 'interior';
  if (
    normalized === 'villa'
    || normalized === 'residential'
    || normalized === 'farmhouse'
    || normalized === 'ceo_mansion'
    || normalized === 'organic_home'
    || normalized === 'holiday_home'
    || normalized === '3d_printing'
  ) {
    return 'residential';
  }
  return 'other';
}

export function sellSubTypesFor(type?: string | null): readonly string[] {
  const category = sellTypeCategory(type);
  if (category === 'apartment' || category === 'nri') return APARTMENT_SUB_TYPES;
  if (category === 'residential') return RESIDENTIAL_SUB_TYPES;
  if (category === 'commercial') return COMMERCIAL_SUB_TYPES;
  return [];
}

export function sellFieldVisibility(type?: string | null): SellFieldVisibility {
  const category = sellTypeCategory(type);
  const isPlotLike = category === 'plot' || category === 'land';
  const isBuiltHome = category === 'apartment' || category === 'residential' || category === 'nri';
  const isCommercial = category === 'commercial';
  const isFractional = category === 'fractional';
  const isInterior = category === 'interior';

  return {
    subType: sellSubTypesFor(type).length > 0,
    bhk: isBuiltHome,
    builtUp: isBuiltHome || isCommercial || isInterior,
    plotArea: isPlotLike || category === 'residential',
    floor: isBuiltHome || isCommercial,
    totalFloors: isBuiltHome || isCommercial,
    unitNo: category === 'apartment' || category === 'nri',
    age: !isPlotLike && !isFractional && !isInterior,
    facing: !isFractional && !isInterior,
    ownership: !isInterior,
    furnishing: isBuiltHome || isCommercial,
    parking: isBuiltHome || isCommercial,
    possession: !isPlotLike && !isFractional,
    loan: !isPlotLike && !isFractional && !isInterior,
    description: true,
    commercialType: isCommercial,
    rera: isBuiltHome || isCommercial,
    plotExtras: isPlotLike,
    nriFields: category === 'nri',
    fractionalFields: isFractional,
    interiorFields: isInterior,
    amenitiesRequired: !isPlotLike && !isInterior && !isFractional,
  };
}

export function digitsOnly(value: string) {
  return String(value || '').replace(/\D/g, '');
}

export function decimalDigits(value: string) {
  const cleaned = String(value || '').replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length ? `${whole}.${rest.join('').replace(/\./g, '')}` : whole;
}

export function firstErrorKey(errors: SellFieldErrors) {
  return Object.keys(errors)[0] || '';
}

export function isSectionValid(errors: SellFieldErrors) {
  return Object.keys(errors).length === 0;
}

export function clearFieldError(errors: SellFieldErrors, key: string): SellFieldErrors {
  if (!errors[key]) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
}

function trim(value: unknown) {
  return String(value ?? '').trim();
}

function isBlank(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  if (typeof value === 'boolean') return false;
  return String(value).trim() === '';
}

export function requiredText(value: unknown, label: string, min: number, max: number) {
  const text = trim(value);
  if (!text) return `Enter ${label.toLowerCase()}.`;
  if (text.length < min) return `${label} must be at least ${min} characters.`;
  if (text.length > max) return `${label} cannot exceed ${max} characters.`;
  return '';
}

export function optionalText(value: unknown, label: string, min: number, max: number) {
  const text = trim(value);
  if (!text) return '';
  if (text.length < min) return `${label} must be at least ${min} characters.`;
  if (text.length > max) return `${label} cannot exceed ${max} characters.`;
  return '';
}

export function lettersText(value: unknown, label: string, min: number, max: number, required = true) {
  const text = trim(value);
  if (!text) return required ? `Enter ${label.toLowerCase()}.` : '';
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(text)) return `${label} can only contain letters and spaces.`;
  if (text.length < min) return `${label} must be at least ${min} characters.`;
  if (text.length > max) return `${label} cannot exceed ${max} characters.`;
  return '';
}

export function indianPincode(value: unknown, required = true) {
  const pin = digitsOnly(String(value || ''));
  if (!pin) return required ? 'Enter a 6-digit PIN code.' : '';
  if (!/^\d{6}$/.test(pin)) return 'PIN code must be exactly 6 digits.';
  if (/^0{6}$/.test(pin)) return 'Enter a valid PIN code.';
  return '';
}

export function indianPhone(value: unknown, label = 'Phone number', required = true) {
  const phone = digitsOnly(String(value || ''));
  if (!phone) return required ? `Enter ${label.toLowerCase()}.` : '';
  if (!/^[6-9]\d{9}$/.test(phone)) return `${label} must be a valid 10-digit Indian mobile number.`;
  return '';
}

export function emailAddress(value: unknown, required = true) {
  const email = trim(value).toLowerCase();
  if (!email) return required ? 'Enter an email address.' : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) {
    return 'Enter a valid email address.';
  }
  return '';
}

export function urlValue(value: unknown, required = false) {
  const url = trim(value);
  if (!url) return required ? 'Enter a URL.' : '';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'Enter a valid URL starting with http:// or https://.';
  } catch {
    return 'Enter a valid URL starting with http:// or https://.';
  }
  return '';
}

export function positiveNumber(value: unknown, label: string, min: number, max: number, required = true) {
  const text = trim(value);
  if (!text) return required ? `Enter ${label.toLowerCase()}.` : '';
  if (/[a-zA-Z]/.test(text)) return `${label} must be a number.`;
  const amount = Number(text);
  if (!Number.isFinite(amount)) return `${label} must be a valid number.`;
  if (amount <= 0) return `${label} must be greater than 0.`;
  if (amount < min) return `${label} must be at least ${min.toLocaleString('en-IN')}.`;
  if (amount > max) return `${label} cannot exceed ${max.toLocaleString('en-IN')}.`;
  return '';
}

export function integerNumber(value: unknown, label: string, min: number, max: number, required = true) {
  const text = trim(value);
  if (!text) return required ? `Enter ${label.toLowerCase()}.` : '';
  if (!/^-?\d+$/.test(text)) return `${label} must be a whole number.`;
  const amount = Number(text);
  if (!Number.isInteger(amount)) return `${label} must be a whole number.`;
  if (amount < min || amount > max) return `${label} must be between ${min} and ${max}.`;
  return '';
}

export function selectedOption(value: unknown, options: readonly string[], label: string, required = true) {
  const text = trim(value);
  if (!text) return required ? `Select ${label.toLowerCase()}.` : '';
  if (options.length && !options.includes(text)) return `Select a valid ${label.toLowerCase()}.`;
  return '';
}

export function dateValue(
  value: unknown,
  label: string,
  options: { required?: boolean; allowFuture?: boolean; allowPast?: boolean } = {},
) {
  const { required = true, allowFuture = true, allowPast = true } = options;
  const text = trim(value);
  if (!text) return required ? `Enter ${label.toLowerCase()}.` : '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return `Enter a valid ${label.toLowerCase()}.`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compare = new Date(date);
  compare.setHours(0, 0, 0, 0);
  if (!allowFuture && compare > today) return `${label} cannot be in the future.`;
  if (!allowPast && compare < today) return `${label} cannot be in the past.`;
  return '';
}

export function requiredChecked(value: unknown, message: string) {
  return value ? '' : message;
}

function mimeFromAsset(asset: Pick<ImagePickerAsset, 'mimeType' | 'uri' | 'fileName'>) {
  if (asset.mimeType) return asset.mimeType.toLowerCase();
  const name = `${asset.fileName || ''} ${asset.uri || ''}`.toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return '';
}

export function validatePhotoAsset(asset: ImagePickerAsset) {
  if ((asset as { type?: string }).type === 'video') return 'Videos are not allowed. Upload photos only.';
  const mime = mimeFromAsset(asset);
  if (!PHOTO_MIME_TYPES.includes(mime as (typeof PHOTO_MIME_TYPES)[number])) {
    return 'Photos must be JPG, PNG, or WEBP.';
  }
  const size = Number(asset.fileSize || 0);
  if (size > SELL_LIMITS.photoMaxBytes) return 'Each photo must be 25MB or smaller.';
  return '';
}

export function validateDocumentAsset(asset: ImagePickerAsset) {
  const mime = mimeFromAsset(asset);
  if (!DOCUMENT_MIME_TYPES.includes(mime as (typeof DOCUMENT_MIME_TYPES)[number])) {
    return 'Documents must be PDF, JPG, or PNG.';
  }
  const size = Number(asset.fileSize || 0);
  if (size > SELL_LIMITS.documentMaxBytes) return 'Each document must be 25MB or smaller.';
  return '';
}

export type SellBasicForm = {
  title: string;
  subType: string;
  bhk: string;
  builtUp: string;
  floor: string;
  totalFloors: string;
  unitNo: string;
  age: string;
};

export type SellAddressForm = {
  building: string;
  area: string;
  city: string;
  pin: string;
  state: string;
  country: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
};

export type SellDetailsForm = {
  title: string;
  bhk: string;
  builtUp: string;
  area: string;
  floor: string;
  facing: string;
  ownership: string;
  possession: string;
  furnish: string;
  furnishDetails: string;
  parking: string;
  parkingType: string;
  loanOnProperty: boolean;
  loanLender: string;
  loanOutstanding: string;
  description: string;
  commercialType: string;
  reraNumber: string;
  roadWidth: string;
  approvalType: string;
  countryOfResidence: string;
  poaHolderName: string;
  poaHolderPhone: string;
  poaHolderEmail: string;
  sharePercentage: string;
  totalPropertyValue: string;
  legalStructure: string;
  scopeOfWork: string;
  budgetRange: string;
  expectedStartDate: string;
  virtualTourUrl: string;
};

export type SellPriceForm = {
  price: string;
  negotiable: boolean;
};

export function validateSellBasic(data: SellBasicForm, type?: string | null): SellFieldErrors {
  const visible = sellFieldVisibility(type);
  const errors: SellFieldErrors = {};
  const titleError = requiredText(data.title, 'Property title', SELL_LIMITS.titleMin, SELL_LIMITS.titleMax);
  if (titleError) errors.title = titleError;

  if (visible.subType) {
    const error = selectedOption(data.subType, sellSubTypesFor(type), 'Property sub-type');
    if (error) errors.subType = error;
  }
  if (visible.bhk) {
    const error = selectedOption(data.bhk, BHK_OPTIONS, 'BHK configuration');
    if (error) errors.bhk = error;
  }
  if (visible.builtUp) {
    const error = positiveNumber(data.builtUp, 'Built-up area', SELL_LIMITS.areaMin, SELL_LIMITS.areaMax);
    if (error) errors.builtUp = error;
  }
  if (visible.floor) {
    const floorError = integerNumber(data.floor, 'Floor number', SELL_LIMITS.floorMin, SELL_LIMITS.floorMax);
    if (floorError) errors.floor = floorError;
  }
  if (visible.totalFloors) {
    const totalError = integerNumber(data.totalFloors, 'Total floors', SELL_LIMITS.totalFloorsMin, SELL_LIMITS.totalFloorsMax);
    if (totalError) errors.totalFloors = totalError;
  }
  if (!errors.floor && !errors.totalFloors && visible.floor && visible.totalFloors && data.floor && data.totalFloors) {
    if (Number(data.floor) > Number(data.totalFloors)) {
      errors.floor = 'Floor number cannot be greater than total floors.';
    }
  }
  if (visible.unitNo) {
    const error = optionalText(data.unitNo, 'Flat / unit number', 1, SELL_LIMITS.unitNoMax);
    if (error) errors.unitNo = error;
  }
  if (visible.age) {
    const error = selectedOption(data.age, AGE_OPTIONS, 'Property age');
    if (error) errors.age = error;
  }
  return errors;
}

export function validateSellAddress(data: SellAddressForm): SellFieldErrors {
  const errors: SellFieldErrors = {};
  const buildingError = requiredText(data.building, 'Building / society name', SELL_LIMITS.streetMin, SELL_LIMITS.streetMax);
  if (buildingError) errors.building = buildingError;
  const localityError = optionalText(data.area, 'Area / locality', SELL_LIMITS.localityMin, SELL_LIMITS.localityMax);
  if (localityError) errors.area = localityError;
  const cityError = lettersText(data.city, 'City', SELL_LIMITS.cityMin, SELL_LIMITS.cityMax, true);
  if (cityError) errors.city = cityError;
  const pinError = indianPincode(data.pin, true);
  if (pinError) errors.pin = pinError;
  const latitude = data.latitude;
  const longitude = data.longitude;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    errors.coordinates = 'Select a location on the map so latitude and longitude can be saved.';
  }
  return errors;
}

export function validateSellDetails(data: SellDetailsForm, type?: string | null): SellFieldErrors {
  const visible = sellFieldVisibility(type);
  const errors: SellFieldErrors = {};
  const titleError = requiredText(data.title, 'Property title', SELL_LIMITS.titleMin, SELL_LIMITS.titleMax);
  if (titleError) errors.title = titleError;

  if (visible.bhk) {
    const compactBhk = ['1', '2', '3', '4', '5+'];
    const allowed = [...BHK_OPTIONS, ...compactBhk];
    const error = selectedOption(data.bhk, allowed, 'BHK');
    if (error) errors.bhk = error;
  }
  if (visible.builtUp) {
    const error = positiveNumber(data.builtUp, 'Built-up area', SELL_LIMITS.areaMin, SELL_LIMITS.areaMax);
    if (error) errors.builtUp = error;
  }
  if (visible.plotArea) {
    const required = sellTypeCategory(type) === 'plot' || sellTypeCategory(type) === 'land';
    const error = positiveNumber(data.area, 'Plot area', SELL_LIMITS.areaMin, SELL_LIMITS.areaMax, required);
    if (error) errors.area = error;
  }
  if (visible.floor && data.floor) {
    const error = integerNumber(data.floor, 'Floor number', SELL_LIMITS.floorMin, SELL_LIMITS.floorMax, false);
    if (error) errors.floor = error;
  }
  if (visible.facing) {
    const error = selectedOption(data.facing, FACING_OPTIONS, 'Facing direction');
    if (error) errors.facing = error;
  }
  if (visible.ownership) {
    const error = selectedOption(data.ownership, OWNERSHIP_OPTIONS, 'Ownership type');
    if (error) errors.ownership = error;
  }
  if (visible.possession) {
    const error = selectedOption(data.possession, POSSESSION_OPTIONS, 'Possession status');
    if (error) errors.possession = error;
  }
  if (visible.furnishing) {
    const error = selectedOption(data.furnish, FURNISH_OPTIONS, 'Furnishing');
    if (error) errors.furnish = error;
    if (!error && data.furnish !== 'Unfurnished') {
      const detailsError = requiredText(data.furnishDetails, 'Furnishing details', SELL_LIMITS.furnishDetailsMin, SELL_LIMITS.furnishDetailsMax);
      if (detailsError) errors.furnishDetails = detailsError;
    }
  }
  if (visible.parking) {
    const parkingError = integerNumber(data.parking, 'Parking count', SELL_LIMITS.parkingMin, SELL_LIMITS.parkingMax);
    if (parkingError) errors.parking = parkingError;
    if (!parkingError && Number(data.parking) > 0) {
      const typeError = selectedOption(data.parkingType, PARKING_TYPE_OPTIONS, 'Parking type');
      if (typeError) errors.parkingType = typeError;
    }
  }
  if (visible.loan && data.loanOnProperty) {
    const lenderError = requiredText(data.loanLender, 'Lender name', SELL_LIMITS.loanLenderMin, SELL_LIMITS.loanLenderMax);
    if (lenderError) errors.loanLender = lenderError;
    const outstandingError = positiveNumber(data.loanOutstanding, 'Outstanding loan amount', 1, SELL_LIMITS.priceMax);
    if (outstandingError) errors.loanOutstanding = outstandingError;
  }
  if (visible.commercialType) {
    const error = selectedOption(data.commercialType, COMMERCIAL_TYPE_OPTIONS, 'Commercial type');
    if (error) errors.commercialType = error;
  }
  if (visible.rera) {
    const error = optionalText(data.reraNumber, 'RERA number', 5, SELL_LIMITS.reraMax);
    if (error) errors.reraNumber = error;
  }
  if (visible.plotExtras) {
    const roadError = positiveNumber(data.roadWidth, 'Road width', SELL_LIMITS.roadWidthMin, SELL_LIMITS.roadWidthMax, false);
    if (roadError) errors.roadWidth = roadError;
    const approvalError = selectedOption(data.approvalType, PLOT_APPROVAL_OPTIONS, 'Approval type', false);
    if (approvalError) errors.approvalType = approvalError;
  }
  if (visible.nriFields) {
    const countryError = lettersText(data.countryOfResidence, 'Country of residence', 2, 80, true);
    if (countryError) errors.countryOfResidence = countryError;
    if (data.ownership === 'Power of Attorney' || trim(data.poaHolderName) || trim(data.poaHolderPhone) || trim(data.poaHolderEmail)) {
      const nameError = requiredText(data.poaHolderName, 'POA holder name', 2, 80);
      if (nameError) errors.poaHolderName = nameError;
      const phoneError = indianPhone(data.poaHolderPhone, 'POA holder phone', true);
      if (phoneError) errors.poaHolderPhone = phoneError;
      const emailError = emailAddress(data.poaHolderEmail, false);
      if (emailError) errors.poaHolderEmail = emailError;
    }
  }
  if (visible.fractionalFields) {
    const shareError = positiveNumber(data.sharePercentage, 'Share percentage', SELL_LIMITS.sharePercentMin, SELL_LIMITS.sharePercentMax);
    if (shareError) errors.sharePercentage = shareError;
    const valueError = positiveNumber(data.totalPropertyValue, 'Total property value', SELL_LIMITS.priceMin, SELL_LIMITS.priceMax);
    if (valueError) errors.totalPropertyValue = valueError;
    const legalError = selectedOption(data.legalStructure, LEGAL_STRUCTURE_OPTIONS, 'Legal structure');
    if (legalError) errors.legalStructure = legalError;
  }
  if (visible.interiorFields) {
    const scopeError = selectedOption(data.scopeOfWork, INTERIOR_SCOPE_OPTIONS, 'Scope of work');
    if (scopeError) errors.scopeOfWork = scopeError;
    const budgetError = requiredText(data.budgetRange, 'Budget range', 2, 80);
    if (budgetError) errors.budgetRange = budgetError;
    const dateError = dateValue(data.expectedStartDate, 'Expected start date', { required: true, allowPast: false, allowFuture: true });
    if (dateError) errors.expectedStartDate = dateError;
  }
  const tourError = urlValue(data.virtualTourUrl, false);
  if (tourError) errors.virtualTourUrl = tourError;
  const descriptionError = optionalText(data.description, 'Description', SELL_LIMITS.descriptionMinIfPresent, SELL_LIMITS.descriptionMax);
  if (descriptionError) errors.description = descriptionError;
  return errors;
}

export function validateSellPhotos(totalSelected: number, newPhotos: ImagePickerAsset[] = []): SellFieldErrors {
  const errors: SellFieldErrors = {};
  if (totalSelected < SELL_LIMITS.photosMin) {
    errors.photos = `Add at least ${SELL_LIMITS.photosMin} photos.`;
  } else if (totalSelected > SELL_LIMITS.photosMax) {
    errors.photos = `You can upload a maximum of ${SELL_LIMITS.photosMax} photos.`;
  }
  const invalidPhoto = newPhotos.map(validatePhotoAsset).find(Boolean);
  if (invalidPhoto) errors.photos = invalidPhoto;
  return errors;
}

export function validateSellAmenities(amenities: string[], type?: string | null): SellFieldErrors {
  const errors: SellFieldErrors = {};
  const visible = sellFieldVisibility(type);
  const cleaned = amenities.map((item) => trim(item)).filter(Boolean);
  if (visible.amenitiesRequired && cleaned.length < SELL_LIMITS.amenityMin) {
    errors.amenities = 'Select at least one amenity.';
  }
  if (cleaned.some((item) => item.length > 60)) {
    errors.amenities = 'Remove invalid amenity values and try again.';
  }
  return errors;
}

export function validateSellPrice(price: string): SellFieldErrors {
  const errors: SellFieldErrors = {};
  const error = positiveNumber(price, 'Expected price', SELL_LIMITS.priceMin, SELL_LIMITS.priceMax);
  if (error) errors.price = error;
  return errors;
}

export function validateSellReview(confirmed: boolean): SellFieldErrors {
  const errors: SellFieldErrors = {};
  const error = requiredChecked(confirmed, 'Confirm that the listing details are accurate before submitting.');
  if (error) errors.confirmed = error;
  return errors;
}

export function validateEditListing(data: { title: string; price: string; area: string; floor: string }, type?: string | null): SellFieldErrors {
  const visible = sellFieldVisibility(type);
  const errors: SellFieldErrors = {};
  const titleError = requiredText(data.title, 'Property title', SELL_LIMITS.titleMin, SELL_LIMITS.titleMax);
  if (titleError) errors.title = titleError;
  const priceError = positiveNumber(data.price, 'Asking price', SELL_LIMITS.priceMin, SELL_LIMITS.priceMax);
  if (priceError) errors.price = priceError;
  if (visible.builtUp || data.area) {
    const areaError = positiveNumber(data.area, 'Built-up area', SELL_LIMITS.areaMin, SELL_LIMITS.areaMax, visible.builtUp);
    if (areaError) errors.area = areaError;
  }
  if (visible.floor || data.floor) {
    const floorError = integerNumber(data.floor, 'Floor number', SELL_LIMITS.floorMin, SELL_LIMITS.floorMax, false);
    if (floorError) errors.floor = floorError;
  }
  return errors;
}

export type SellSectionError = {
  section: string;
  screen: string;
  field: string;
  message: string;
};

function str(value: unknown) {
  if (value === undefined || value === null) return '';
  return String(value);
}

export function hydrateSellBasic(ctx: any, request?: SellRequest | null): SellBasicForm {
  const specs = (request?.specifications ?? ctx?.sellRequest?.specifications ?? {}) as Record<string, unknown>;
  const basic = ctx?.basic ?? {};
  return {
    title: str(basic.title || request?.propertyTitle || ctx?.sellRequest?.propertyTitle || ''),
    subType: str(basic.subType || specs.subType || ''),
    bhk: str(basic.bhk || specs.bhk || ''),
    builtUp: str(basic.builtUp || specs.builtUpArea || ''),
    floor: str(basic.floor || specs.floor || ''),
    totalFloors: str(basic.totalFloors || specs.totalFloors || specs.floors || ''),
    unitNo: str(basic.unitNo || specs.unitNo || specs.unitNumber || ''),
    age: str(basic.age || specs.age || specs.propertyAge || ''),
  };
}

export function hydrateSellAddress(ctx: any, request?: SellRequest | null): SellAddressForm {
  const address = request?.address ?? ctx?.sellRequest?.address ?? {};
  const location = ctx?.location ?? {};
  const latitudeRaw = location.latitude ?? address.latitude;
  const longitudeRaw = location.longitude ?? address.longitude;
  const latitude = typeof latitudeRaw === 'number' ? latitudeRaw : Number(latitudeRaw);
  const longitude = typeof longitudeRaw === 'number' ? longitudeRaw : Number(longitudeRaw);
  return {
    building: str(location.building || address.street || ''),
    area: str(location.area || address.locality || ''),
    city: str(location.city || address.city || ''),
    pin: digitsOnly(str(location.pin || address.pincode || '')),
    state: str(location.state || address.state || ''),
    country: str(location.country || address.country || 'India'),
    formattedAddress: str(location.formattedAddress || ''),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

export function hydrateSellDetails(ctx: any, request?: SellRequest | null): SellDetailsForm {
  const specs = (request?.specifications ?? ctx?.sellRequest?.specifications ?? {}) as Record<string, unknown>;
  const details = ctx?.details ?? {};
  const basic = ctx?.basic ?? {};
  const loan = (request?.loanDetails ?? ctx?.sellRequest?.loanDetails ?? {}) as Record<string, unknown>;
  return {
    title: str(details.title || request?.propertyTitle || ctx?.sellRequest?.propertyTitle || basic.title || ''),
    bhk: str(details.bhk || specs.bhk || basic.bhk || ''),
    builtUp: str(details.builtUp || specs.builtUpArea || basic.builtUp || ''),
    area: str(details.area || specs.plotArea || specs.area || specs.totalArea || ''),
    floor: str(details.floor || specs.floor || basic.floor || ''),
    facing: str(details.facing || specs.facing || ''),
    ownership: str(details.ownership || request?.ownershipType || ctx?.sellRequest?.ownershipType || ''),
    possession: str(details.possession || request?.possessionStatus || ctx?.sellRequest?.possessionStatus || specs.possessionStatus || ''),
    furnish: str(details.furnish || specs.furnishing || ''),
    furnishDetails: str(details.furnishDetails || specs.furnishDetails || ''),
    parking: str(details.parking ?? specs.parking ?? specs.parkingCount ?? ''),
    parkingType: str(details.parkingType || specs.parkingType || ''),
    loanOnProperty: Boolean(details.loanOnProperty ?? request?.loanOnProperty ?? ctx?.sellRequest?.loanOnProperty),
    loanLender: str(details.loanLender || loan.lender || ''),
    loanOutstanding: str(details.loanOutstanding || loan.outstanding || ''),
    description: str(details.description || request?.description || ctx?.sellRequest?.description || ''),
    commercialType: str(details.commercialType || specs.commercialType || ''),
    reraNumber: str(details.reraNumber || specs.reraNumber || specs.rera || ''),
    roadWidth: str(details.roadWidth || specs.roadWidth || ''),
    approvalType: str(details.approvalType || specs.approvalType || ''),
    countryOfResidence: str(details.countryOfResidence || specs.countryOfResidence || ''),
    poaHolderName: str(details.poaHolderName || specs.poaHolderName || ''),
    poaHolderPhone: str(details.poaHolderPhone || specs.poaHolderPhone || ''),
    poaHolderEmail: str(details.poaHolderEmail || specs.poaHolderEmail || ''),
    sharePercentage: str(details.sharePercentage || specs.sharePercentage || ''),
    totalPropertyValue: str(details.totalPropertyValue || specs.totalPropertyValue || ''),
    legalStructure: str(details.legalStructure || specs.legalStructure || ''),
    scopeOfWork: str(details.scopeOfWork || specs.scopeOfWork || ''),
    budgetRange: str(details.budgetRange || specs.budgetRange || ''),
    expectedStartDate: str(details.expectedStartDate || specs.expectedStartDate || ''),
    virtualTourUrl: str(details.virtualTourUrl || specs.virtualTourUrl || ''),
  };
}

export function validateSellSubmission(
  request?: SellRequest | null,
  ctx?: any,
): SellSectionError[] {
  const type = request?.propertyType || ctx?.type || '';
  const basic = hydrateSellBasic(ctx, request);
  if (!basic.title) basic.title = str(request?.propertyTitle);
  const address = hydrateSellAddress(ctx, request);
  const details = hydrateSellDetails(ctx, request);
  if (!ctx?.details && !request?.ownershipType && !ctx?.sellRequest?.ownershipType) details.ownership = '';
  if (!ctx?.details && !request?.specifications?.facing && !ctx?.sellRequest?.specifications?.facing) details.facing = '';
  if (!ctx?.details && !request?.possessionStatus && !ctx?.sellRequest?.possessionStatus) details.possession = '';
  const price = str(ctx?.price || request?.askingPrice || '');
  const amenities = (request?.amenities ?? ctx?.amenities ?? []) as string[];
  const photoCount = Math.max(
    request?.photosCount || 0,
    (request?.photos || []).filter(Boolean).length,
    Array.isArray(ctx?.photos) ? ctx.photos.filter(Boolean).length : 0,
  );

  const issues: SellSectionError[] = [];
  const push = (section: string, screen: string, errors: SellFieldErrors) => {
    Object.entries(errors).forEach(([field, message]) => {
      issues.push({ section, screen, field, message });
    });
  };

  push('Basic Details', 'sellIntent', validateSellBasic(basic, type));
  push('Location', 'sellAddress', validateSellAddress(address));
  push('Property Details', 'sellDetails', validateSellDetails(details, type));
  push('Photos', 'sellPhotos', validateSellPhotos(photoCount));
  push('Amenities', 'sellAmenities', validateSellAmenities(amenities, type));
  push('Expected Price', 'sellPrice', validateSellPrice(price));
  return issues;
}

export function useSellFormScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const fieldY = useRef<Record<string, number>>({});
  const formY = useRef(0);

  const registerForm = (y: number) => {
    formY.current = y;
  };
  const registerField = (key: string, y: number) => {
    fieldY.current[key] = formY.current + y;
  };
  const scrollToField = (key?: string) => {
    if (!key) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const y = fieldY.current[key];
    if (typeof y === 'number') scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    else scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return { scrollRef, registerForm, registerField, scrollToField };
}

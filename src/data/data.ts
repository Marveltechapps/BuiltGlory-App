// data.ts — sample data for Builtglory app

export type Property = {
  id: string;
  title: string;
  price: number;
  type: string;
  bhk: number;
  area: number;
  floor: string;
  flatNo: string;
  location: string;
  city: string;
  images: string[];
  amenities: string[];
  verified: boolean;
  negotiable: boolean;
  views: number;
  enquiries: number;
  posted: string;
  rating: number;
  sqftPrice: number;
  builder: string;
  desc: string;
  badge: string;
  launchDate?: string;
};

export const PROPERTIES: Property[] = [
  {
    id: 'p1',
    title: 'Sunrise Heights — 3 BHK',
    price: 8500000,
    type: 'apartment',
    bhk: 3, area: 1450, floor: '7th of 12', flatNo: 'B-704',
    location: 'Adyar', city: 'Chennai',
    images: ['img-1', 'img-2', 'img-3', 'img-4'],
    amenities: ['Lift', 'Gym', 'Pool', 'Power Backup', 'Park', 'Security'],
    verified: true, negotiable: true, views: 1284, enquiries: 36,
    posted: '2 days ago', rating: 4.6,
    sqftPrice: 5862, builder: 'Sunrise Developers',
    desc: 'A bright east-facing 3 BHK in a gated community, walking distance to Adyar metro and beach. Modular kitchen, balconies on living and master.',
    badge: 'For Sale',
  },
  {
    id: 'p2',
    title: 'Coastal Villa with Garden',
    price: 24500000,
    type: 'villa',
    bhk: 4, area: 3200, floor: 'G+1', flatNo: '—',
    location: 'ECR, Neelankarai', city: 'Chennai',
    images: ['img-1', 'img-2', 'img-3'],
    amenities: ['Garden', 'Pool', 'Parking', 'Servant Room', 'Solar', 'EV Charger'],
    verified: true, negotiable: false, views: 2410, enquiries: 78,
    posted: '5 days ago', rating: 4.9,
    sqftPrice: 7656, builder: 'Coastal Crafts',
    desc: 'Premium villa on the East Coast Road with private lawn and pool. Built with passive cooling and 6kW solar.',
    badge: 'For Sale',
  },
  {
    id: 'p3',
    title: 'Greenfield Plot — Residential',
    price: 3200000,
    type: 'plot',
    bhk: 0, area: 2400, floor: '—', flatNo: '—',
    location: 'Perumaleri', city: 'Chennai',
    images: ['img-1', 'img-2'],
    amenities: ['Compound wall', 'Bus route', 'Street lights', 'Internal roads'],
    verified: true, negotiable: true, views: 642, enquiries: 18,
    posted: '1 week ago', rating: 4.4,
    sqftPrice: 1333, builder: 'Greenfield Estates',
    desc: 'Approved residential plot near Mahabalipuram heritage corridor. East-facing, 2 acres total, sub-plots from 600 sq ft.',
    badge: 'For Sale',
  },
  {
    id: 'p4',
    title: 'Skyline Office — Commercial',
    price: 19500000,
    type: 'commercial',
    bhk: 0, area: 2100, floor: '11th of 18', flatNo: '1101',
    location: 'OMR, Thoraipakkam', city: 'Chennai',
    images: ['img-1', 'img-2', 'img-3'],
    amenities: ['24/7 Access', 'Reception', 'Lift', 'Backup', 'Cafeteria', 'CCTV'],
    verified: true, negotiable: true, views: 832, enquiries: 22,
    posted: '3 days ago', rating: 4.7,
    sqftPrice: 9285, builder: 'Skyline Corp.',
    desc: 'Grade-A office space on OMR with sea-view, fully fitted with HVAC and partitioned cabins.',
    badge: 'For Sale',
  },
  {
    id: 'p5',
    title: 'Maple Court — 2 BHK',
    price: 5600000,
    type: 'apartment',
    bhk: 2, area: 980, floor: '4th of 8', flatNo: 'A-402',
    location: 'Velachery', city: 'Chennai',
    images: ['img-1', 'img-2', 'img-3'],
    amenities: ['Lift', 'Park', 'Power Backup', 'Security', 'Parking'],
    verified: false, negotiable: true, views: 521, enquiries: 14,
    posted: '4 days ago', rating: 4.2,
    sqftPrice: 5714, builder: 'Maple Homes',
    desc: 'Comfortable 2 BHK in a quiet pocket of Velachery. 2 covered parking spots, walking distance to schools and metro.',
    badge: 'For Sale',
  },
  {
    id: 'p6',
    title: 'Lakeview Apartment — 3 BHK',
    price: 11200000,
    type: 'apartment',
    bhk: 3, area: 1620, floor: '9th of 14', flatNo: 'C-904',
    location: 'Nungambakkam', city: 'Chennai',
    images: ['img-1', 'img-2', 'img-3', 'img-4'],
    amenities: ['Pool', 'Gym', 'Lift', 'Club', 'Park', 'Security', 'Backup'],
    verified: true, negotiable: false, views: 1850, enquiries: 64,
    posted: '6 days ago', rating: 4.8,
    sqftPrice: 6913, builder: 'Lakeview Residency',
    desc: 'Lake-facing 3 BHK with panoramic views, premium fittings, and full clubhouse access.',
    badge: 'Upcoming',
    launchDate: '2026-08-15',
  },
  {
    id: 'p7',
    title: 'Heritage Plot — Mahabalipuram',
    price: 4800000,
    type: 'plot',
    bhk: 0, area: 3600, floor: '—', flatNo: '—',
    location: 'Mahabalipuram', city: 'Chennai',
    images: ['img-1'],
    amenities: ['Beach access', 'Compound wall', 'Tarred road'],
    verified: true, negotiable: true, views: 421, enquiries: 9,
    posted: '2 weeks ago', rating: 4.5,
    sqftPrice: 1333, builder: 'Heritage Land Co.',
    desc: '8 minutes from the ancient shore temples. Tourism-zoned, eligible for stay-rental construction.',
    badge: 'Upcoming',
    launchDate: '2026-07-10',
  },
];

export const PROPERTY_TYPES = [
  { id: 'plot', label: 'Plot', sub: '', icon: 'map-pin' },
  { id: 'apartment', label: 'Apartment', sub: '', icon: 'building-2' },
  { id: 'villa', label: 'Villa', sub: '', icon: 'home' },
  { id: 'commercial', label: 'Commercial', sub: '', icon: 'briefcase' },
  { id: 'land', label: 'Land', sub: 'Land Bank', icon: 'map' },
  { id: 'fractional', label: 'Fractional', sub: 'Ownership', icon: 'pie-chart' },
  { id: '3d-print', label: '3D Print', sub: 'Home', icon: 'box' },
  { id: 'organic', label: 'Organic', sub: 'Home', icon: 'leaf' },
  { id: 'ceo-mansion', label: 'CEO', sub: 'Mansion', icon: 'crown' },
  { id: 'holiday', label: 'Holiday', sub: 'Home', icon: 'umbrella' },
  { id: 'farmhouse', label: 'Farmhouse', sub: '', icon: 'warehouse' },
  { id: 'nri', label: 'NRI', sub: 'Services', icon: 'globe' },
  { id: 'interior', label: 'Interior', sub: '', icon: 'sofa' },
];

export const SPECS = [
  { label: 'Lift', icon: 'arrow-up-down' },
  { label: 'Gym', icon: 'dumbbell' },
  { label: 'Pool', icon: 'waves' },
  { label: 'Garden', icon: 'trees' },
  { label: 'Parking', icon: 'car' },
  { label: 'Security', icon: 'circle-check-big' },
  { label: 'Power Backup', icon: 'zap' },
  { label: 'CCTV', icon: 'video' },
  { label: 'Club House', icon: 'users' },
  { label: 'Wifi', icon: 'wifi' },
  { label: 'Solar', icon: 'sun' },
  { label: 'EV Charger', icon: 'plug' },
  { label: 'Servants', icon: 'user' },
  { label: 'Lounge', icon: 'sofa' },
  { label: 'Library', icon: 'book-open' },
  { label: 'Play Area', icon: 'baby' },
  { label: 'Jogging Track', icon: 'footprints' },
  { label: 'Pet Friendly', icon: 'dog' },
  { label: 'Fire Safety', icon: 'flame' },
  { label: 'Rainwater', icon: 'cloud-rain' },
];

export const FAQS = [
  { q: 'How are listings verified?', a: 'Our team conducts legal verification, title checks and a site visit before publishing any listing on Builtglory.' },
  { q: 'What payment options are available?', a: 'We support UPI, NEFT/RTGS, bank transfer and home loans from partner banks.' },
  { q: 'Can I schedule a visit to the property?', a: "Yes, pick a date and time from the visit calendar — our agent will confirm within an hour." },
  { q: 'Do you charge brokerage?', a: 'No middlemen, no commissions. The price you see is the price you pay.' },
  { q: 'How is my data secured?', a: 'All your personal data is encrypted at rest with AES-256 and only shared with verified sellers after your consent.' },
];

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  plot: 'Plot',
  apartment: 'Apartment',
  residential: 'Residential',
  commercial: 'Commercial',
  villa: 'Villa',
  land: 'Land',
  fractional: 'Fractional',
  '3d_printing': '3D Printing',
  '3d-print': '3D Print',
  organic_home: 'Organic Home',
  organic: 'Organic',
  ceo_mansion: 'CEO Mansion',
  'ceo-mansion': 'CEO Mansion',
  holiday_home: 'Holiday Home',
  holiday: 'Holiday Home',
  farmhouse: 'Farmhouse',
  nri: 'NRI',
  interior: 'Interior',
};

export function formatPropertyTypeLabel(type?: string | null): string {
  const normalized = String(type || '').trim();
  if (!normalized) return 'Property';
  const key = normalized.toLowerCase();
  return PROPERTY_TYPE_LABELS[key] ?? key
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.toUpperCase() === 'NRI' ? 'NRI' : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatINR(n: number): string {
  if (n >= 10000000) return `₹ ${(n / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (n >= 100000) return `₹ ${(n / 100000).toFixed(2).replace(/\.00$/, '')} L`;
  return `₹ ${n.toLocaleString('en-IN')}`;
}

export const SHARED_DOCS = [
  { id: 'sale-deed', name: 'Sale Deed', meta: 'PDF · 2.4 MB · 14 pages' },
  { id: 'approval', name: 'Approval Document', meta: 'PDF · 1.1 MB · 6 pages' },
  { id: 'layout', name: 'Layout Plan', meta: 'PDF · 3.8 MB · 2 pages' },
  { id: 'legal', name: 'Legal Opinion', meta: 'PDF · 0.9 MB · 4 pages' },
];

export const BANK = {
  holder: 'Builtglory Escrow A/C',
  bank: 'HDFC Bank',
  acc: '5010 0234 5678 90',
  ifsc: 'HDFC0001234',
  branch: 'Adyar, Chennai',
  upi: 'builtglory@hdfcbank',
};

export const FAQ_TOPICS = [
  { id: 'buying', label: 'Buying', icon: 'home', count: 12 },
  { id: 'selling', label: 'Selling', icon: 'tag', count: 9 },
  { id: 'legal', label: 'Legal', icon: 'scale', count: 7 },
  { id: 'payment', label: 'Payment', icon: 'wallet', count: 8 },
  { id: 'nri', label: 'NRI', icon: 'globe', count: 6 },
  { id: 'app', label: 'App Usage', icon: 'smartphone', count: 10 },
  { id: 'account', label: 'Account', icon: 'user', count: 5 },
  { id: 'other', label: 'Other', icon: 'circle-help', count: 4 },
];

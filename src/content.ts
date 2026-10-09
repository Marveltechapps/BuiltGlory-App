import { useCallback, useEffect, useMemo, useState } from 'react';
import { FAQS, FAQ_TOPICS } from './data/data';
import { getPublicContent, listPublicContent, PublicContentItem } from './api/customer';
import { COMPANY_SUPPORT_EMAIL, COMPANY_SUPPORT_PHONE_DISPLAY, COMPANY_WHATSAPP_DIGITS } from './config/companyContact';
import { useAppState } from './state/AppState';
import { contentItemCacheKey } from './state/primaryTabCache';

export const fallbackFaqContent: PublicContentItem[] = FAQS.map((faq, index) => {
  const categories = ['buying', 'payment', 'buying', 'selling', 'account'];
  const topic = FAQ_TOPICS.find((item) => item.id === categories[index]);
  return {
    slug: `fallback-faq-${index}`,
    section: 'faq',
    title: faq.q,
    body: faq.a,
    category: categories[index] ?? 'general',
    order: index,
    metadata: {
      icon: topic?.icon ?? 'circle-help',
      topicLabel: topic?.label ?? 'General',
    },
  };
});

export const fallbackTermsContent: PublicContentItem = {
  slug: 'terms-of-service',
  section: 'legal',
  title: 'Builtglory Marketplace Agreement',
  body:
    'By using Builtglory you agree to be bound by these terms. We connect buyers, sellers and renters of real estate across India and verify each listing before it appears.\n\nWe collect personal data such as your name, phone, email and location to operate the service. Property documents you upload are stored encrypted and shared only with the buyer you approve.\n\nNo commission is charged to buyers or sellers.',
  category: 'terms',
};

export const fallbackPrivacyContent: PublicContentItem = {
  slug: 'privacy-policy',
  section: 'legal',
  title: 'Privacy Policy',
  excerpt: 'How we use and protect your data',
  body:
    'Builtglory collects profile, contact, property preference, transaction, support, and verification information to operate the marketplace.\n\nWe do not sell your data to third parties. Documents are used only for verification and transaction support.\n\nFor privacy questions, contact privacy@builtglory.com.',
  category: 'privacy',
};

export const fallbackAboutContent: PublicContentItem = {
  slug: 'about-builtglory',
  section: 'about',
  title: 'About Builtglory',
  excerpt: "India's verified real estate marketplace",
  body:
    "Builtglory is India's verified real estate marketplace dedicated to simplifying property transactions for buyers, sellers, and investors. We combine AI-driven valuations, rigorous legal verification, and transparent escrow to build trust in real estate.",
  metadata: {
    version: '1.0.0',
    copyright: '2026 Builtglory',
    supportEmail: COMPANY_SUPPORT_EMAIL,
    supportPhone: COMPANY_SUPPORT_PHONE_DISPLAY,
    supportWhatsApp: COMPANY_WHATSAPP_DIGITS,
    address: '123 Tech Park, OMR, Adyar, Chennai 600020, India',
    tagline: 'Simplifying real estate, one transaction at a time',
    steps: [
      { title: 'Seller Lists', desc: 'Property owners submit listings with verified documents and photos.' },
      { title: 'Valuation & Buyer Match', desc: 'AI evaluates properties and connects verified buyers through our platform.' },
      { title: 'Safe Transaction', desc: 'Escrow payments, legal verification, and registration assistance ensure a smooth sale.' },
    ],
  },
};

export const fallbackNewsContent: PublicContentItem[] = [
  { slug: 'news-chennai-omr-q1-2026', section: 'news', category: 'Market Update', title: 'Chennai OMR: 15% appreciation in Q1 2026', metadata: { publishedLabel: '2 days ago', readTime: '4 min' } },
  { slug: 'news-adyar-residential-zone', section: 'news', category: 'Investment', title: 'Why Adyar remains the top residential zone', metadata: { publishedLabel: '1 week ago', readTime: '6 min' } },
  { slug: 'news-rera-amendments-2026', section: 'news', category: 'Policy', title: 'New RERA amendments for 2026', metadata: { publishedLabel: '2 weeks ago', readTime: '5 min' } },
];

export function contentBody(item?: PublicContentItem | null) {
  return item?.body || '';
}

export function contentMetaString(item: PublicContentItem | undefined, key: string, fallback = '') {
  const value = item?.metadata?.[key];
  return typeof value === 'string' ? value : fallback;
}

export function contentMetaArray<T>(item: PublicContentItem | undefined, key: string, fallback: T[] = []) {
  const value = item?.metadata?.[key];
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export function useContentSection(section: PublicContentItem['section'], fallback: PublicContentItem[]) {
  const [items, setItems] = useState<PublicContentItem[]>(fallback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listPublicContent({ section, limit: 100 });
      setItems(next.length ? next : fallback);
    } catch (err) {
      setItems(fallback);
      setError(err instanceof Error ? err.message : 'Could not load content.');
    } finally {
      setLoading(false);
    }
  }, [fallback, section]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, error, reload: load };
}

export function useContentItem(slug: string, fallback: PublicContentItem) {
  const { getCachedValue, setCachedValue } = useAppState();
  const cacheKey = contentItemCacheKey(slug);
  const [item, setItem] = useState<PublicContentItem>(() => getCachedValue<PublicContentItem>(cacheKey) ?? fallback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cached = getCachedValue<PublicContentItem>(cacheKey);
    if (cached) {
      setItem(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await getPublicContent(slug);
      setItem(next);
      setCachedValue(cacheKey, next);
    } catch (err) {
      setItem(fallback);
      setError(err instanceof Error ? err.message : 'Could not load content.');
    } finally {
      setLoading(false);
    }
  }, [cacheKey, fallback, getCachedValue, setCachedValue, slug]);

  useEffect(() => {
    load();
  }, [load]);

  return { item, loading, error, reload: load };
}

export function useFaqTopics(items: PublicContentItem[]) {
  return useMemo(() => {
    const counts = new Map<string, { id: string; label: string; icon: string; count: number }>();
    items.forEach((item) => {
      const id = item.category || 'general';
      const topic = FAQ_TOPICS.find((t) => t.id === id);
      const label = contentMetaString(item, 'topicLabel', topic?.label ?? id.replace(/(^|-)(\w)/g, (_, sep, char) => `${sep ? ' ' : ''}${String(char).toUpperCase()}`));
      const icon = contentMetaString(item, 'icon', topic?.icon ?? 'circle-help');
      const current = counts.get(id) ?? { id, label, icon, count: 0 };
      counts.set(id, { ...current, count: current.count + 1 });
    });
    return Array.from(counts.values());
  }, [items]);
}

import { useCallback, useEffect, useState } from 'react';
import { BuyEnquiry, getBuyEnquiry, listBuyEnquiries } from '../api/customer';
import { useAppState } from '../state/AppState';
import { BUY_ENQUIRIES_CACHE_PREFIX } from '../state/primaryTabCache';
import { usePolling } from './usePolling';
import { isNetworkError, resourceErrorMessage } from '../utils/apiErrors';
import { enquiryId as enquiryIdFromModel } from '../utils/buyEnquiryStatus';

export type BuyEnquiryNavContext = {
  enquiryId?: string;
  dealId?: string;
  propertyId?: string;
  enquiry?: BuyEnquiry;
  refresh?: boolean;
  entityId?: string;
  entityType?: string;
};

function dealIdFromEnquiry(enquiry?: BuyEnquiry | null) {
  const deal = (enquiry as { deal?: { _id?: string; id?: string } } | null | undefined)?.deal;
  return String(deal?._id ?? deal?.id ?? (enquiry as { dealId?: string } | null | undefined)?.dealId ?? '');
}

export function propertyIdFromEnquiry(enquiry?: BuyEnquiry | null) {
  const propertyId = enquiry?.propertyId;
  if (typeof propertyId === 'string') return propertyId;
  if (propertyId && typeof propertyId === 'object') {
    return String((propertyId as { _id?: string; id?: string })._id ?? (propertyId as { _id?: string; id?: string }).id ?? '');
  }
  return '';
}

export async function resolveBuyEnquiryId(authToken: string, ctx: BuyEnquiryNavContext = {}) {
  const direct = String(ctx.enquiryId || enquiryIdFromModel(ctx.enquiry) || '').trim();
  if (direct) return direct;

  const dealId = String(
    ctx.dealId || (String(ctx.entityType || '').toLowerCase() === 'sales_deal' ? ctx.entityId : '') || '',
  ).trim();
  if (!dealId || !authToken) return '';

  const enquiries = await listBuyEnquiries(authToken, { limit: 50, sort: 'newest' });
  const match = enquiries.find((item) => dealIdFromEnquiry(item) === dealId);
  return enquiryIdFromModel(match);
}

export function useBuyEnquiryResource(ctx: BuyEnquiryNavContext = {}, options: { pollMs?: number } = {}) {
  const { authToken, getCachedValue, setCachedValue } = useAppState();
  const initial = ctx.enquiry;
  const [enquiry, setEnquiry] = useState<BuyEnquiry | null>(initial ?? null);
  const [enquiryId, setEnquiryId] = useState(String(ctx.enquiryId || enquiryIdFromModel(initial) || ''));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const pollMs = options.pollMs ?? 10000;

  const syncCache = useCallback((latest: BuyEnquiry) => {
    if (!authToken) return;
    const cacheKey = `${BUY_ENQUIRIES_CACHE_PREFIX}:${authToken}`;
    const cached = getCachedValue<BuyEnquiry[]>(cacheKey);
    if (!cached) return;
    const next = cached.map((item) => enquiryIdFromModel(item) === enquiryIdFromModel(latest) ? latest : item);
    setCachedValue(cacheKey, next);
  }, [authToken, getCachedValue, setCachedValue]);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    const silent = opts.silent ?? false;
    if (!authToken) {
      setLoading(false);
      setError('Please sign in again to load this enquiry.');
      return;
    }

    if (!silent) {
      setLoading(true);
      setError(null);
      setOffline(false);
    }

    try {
      const resolvedId = await resolveBuyEnquiryId(authToken, {
        enquiryId: ctx.enquiryId,
        dealId: ctx.dealId,
        entityId: ctx.entityId,
        entityType: ctx.entityType,
        enquiry: ctx.enquiry,
      });
      if (!resolvedId) {
        setEnquiry(null);
        setEnquiryId('');
        setError('Enquiry context is missing from this notification.');
        return;
      }
      setEnquiryId(resolvedId);
      const latest = await getBuyEnquiry(authToken, resolvedId);
      setEnquiry(latest);
      syncCache(latest);
      setError(null);
      setOffline(false);
    } catch (err) {
      if (isNetworkError(err)) setOffline(true);
      if (!silent) setError(resourceErrorMessage(err, 'Could not load enquiry details.'));
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, [authToken, ctx.dealId, ctx.enquiry, ctx.enquiryId, ctx.entityId, ctx.entityType, syncCache]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
  }, [load]);

  useEffect(() => {
    load({ silent: false });
  }, [authToken, ctx.enquiryId, ctx.dealId, ctx.entityId, ctx.entityType, ctx.refresh, load]);

  usePolling(() => load({ silent: true }), pollMs, Boolean(authToken && (enquiryId || ctx.enquiryId || ctx.dealId)));

  return {
    enquiry,
    enquiryId,
    propertyId: propertyIdFromEnquiry(enquiry) || String(ctx.propertyId || ''),
    dealId: dealIdFromEnquiry(enquiry) || String(ctx.dealId || ''),
    loading,
    refreshing,
    error,
    offline,
    reload: () => load({ silent: false }),
    refresh,
  };
}

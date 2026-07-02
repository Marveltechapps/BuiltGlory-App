import type { CustomerProfile } from '../api/customer';

export function hasCompletedBasicProfile(user: CustomerProfile | null | undefined) {
  const name = typeof user?.name === 'string' ? user.name : typeof user?.fullName === 'string' ? user.fullName : '';
  return name.trim().length >= 2;
}

export function nextAuthenticatedRoute(user: CustomerProfile | null | undefined) {
  return hasCompletedBasicProfile(user) ? 'home' : 'profileSetup';
}

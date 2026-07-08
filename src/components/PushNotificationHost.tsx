import { usePushNotifications } from '../hooks/usePushNotifications';
import { NotificationBanner } from './NotificationBanner';

export function PushNotificationHost() {
  const { banner, dismissBanner, handleBannerPress } = usePushNotifications();

  if (!banner) return null;

  return (
    <NotificationBanner
      banner={banner}
      onDismiss={dismissBanner}
      onPress={handleBannerPress}
    />
  );
}

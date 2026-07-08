import * as Contacts from 'expo-contacts';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { isRunningInExpoGo } from 'expo';
import { Linking, Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

function getNotificationsModule(): NotificationsModule | null {
  if (isRunningInExpoGo()) return null;
  return require('expo-notifications') as NotificationsModule;
}

export type PermissionId = 'cam' | 'loc' | 'noti' | 'cont';

export type PermissionStatus = 'pending' | 'granted' | 'denied' | 'blocked';

type ExpoPermission = {
  granted: boolean;
  canAskAgain?: boolean;
  status?: string;
};

function mapExpoPermission(permission: ExpoPermission): PermissionStatus {
  if (permission.granted) return 'granted';
  if (permission.status === 'undetermined') return 'pending';
  if (permission.canAskAgain === false) return 'blocked';
  return 'denied';
}

function mergePermissionResults(results: ExpoPermission[]): PermissionStatus {
  const statuses = results.map(mapExpoPermission);
  if (statuses.every((status) => status === 'granted')) return 'granted';
  if (statuses.some((status) => status === 'pending')) return 'pending';
  if (statuses.some((status) => status === 'blocked')) return 'blocked';
  return 'denied';
}

export async function getPermissionStatus(id: PermissionId): Promise<PermissionStatus> {
  switch (id) {
    case 'cam': {
      const [camera, media] = await Promise.all([
        ImagePicker.getCameraPermissionsAsync(),
        ImagePicker.getMediaLibraryPermissionsAsync(),
      ]);
      return mergePermissionResults([camera, media]);
    }
    case 'loc': {
      const permission = await Location.getForegroundPermissionsAsync();
      return mapExpoPermission({
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      });
    }
    case 'noti': {
      const Notifications = getNotificationsModule();
      if (!Notifications) return 'pending';
      const permission = await Notifications.getPermissionsAsync();
      return mapExpoPermission({
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      });
    }
    case 'cont': {
      const permission = await Contacts.getPermissionsAsync();
      return mapExpoPermission({
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      });
    }
    default:
      return 'pending';
  }
}

export async function requestPermission(id: PermissionId): Promise<PermissionStatus> {
  switch (id) {
    case 'cam': {
      const [camera, media] = await Promise.all([
        ImagePicker.requestCameraPermissionsAsync(),
        ImagePicker.requestMediaLibraryPermissionsAsync(),
      ]);
      return mergePermissionResults([camera, media]);
    }
    case 'loc': {
      const permission = await Location.requestForegroundPermissionsAsync();
      return mapExpoPermission({
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      });
    }
    case 'noti': {
      const Notifications = getNotificationsModule();
      if (!Notifications) return 'pending';
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#E6F4FE',
        });
      }
      const permission = await Notifications.requestPermissionsAsync();
      return mapExpoPermission({
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      });
    }
    case 'cont': {
      const permission = await Contacts.requestPermissionsAsync();
      return mapExpoPermission({
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      });
    }
    default:
      return 'pending';
  }
}

export async function openAppSettings() {
  await Linking.openSettings();
}

export function permissionStatusLabel(status: PermissionStatus) {
  switch (status) {
    case 'granted':
      return 'Allowed';
    case 'denied':
      return 'Denied';
    case 'blocked':
      return 'Blocked';
    default:
      return 'Not set';
  }
}

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Icon from './Icon';
import { embeddableMediaUrl } from '../utils/propertyMedia';

type PropertyEmbedViewerProps = {
  url: string;
  label?: string;
  onOpenExternal?: () => void;
};

export function PropertyEmbedViewer({ url, label = 'content', onOpenExternal }: PropertyEmbedViewerProps) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const embedUrl = embeddableMediaUrl(url);

  const retry = useCallback(() => {
    setFailed(false);
    setLoading(true);
  }, []);

  const openExternal = useCallback(() => {
    if (onOpenExternal) {
      onOpenExternal();
      return;
    }
    Linking.openURL(url).catch(() => undefined);
  }, [onOpenExternal, url]);

  if (failed) {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-ink-900">
        <Icon name="alert-circle" size={36} color="#F87171" />
        <Text className="text-white text-[14px] font-semibold mt-3 text-center">Could not load {label}</Text>
        <Text className="text-white/60 text-[12px] mt-1 text-center">The embedded viewer could not open this link in the app.</Text>
        <View className="flex-row gap-2 mt-4">
          <Pressable onPress={retry} className="px-4 py-2 rounded-full bg-white/10">
            <Text className="text-white text-[12px] font-semibold">Retry</Text>
          </Pressable>
          <Pressable onPress={openExternal} className="px-4 py-2 rounded-full bg-brand-600">
            <Text className="text-white text-[12px] font-semibold">Open in browser</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-ink-900">
      {loading && (
        <View className="absolute inset-0 items-center justify-center z-10 bg-ink-900/90">
          <ActivityIndicator color="#1A6FFF" size="large" />
          <Text className="text-white/70 text-[12px] mt-2">Loading {label}...</Text>
        </View>
      )}
      <WebView
        key={embedUrl}
        source={{ uri: embedUrl }}
        style={{ flex: 1, backgroundColor: '#0F172A' }}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        onHttpError={() => {
          setLoading(false);
          setFailed(true);
        }}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        setSupportMultipleWindows={false}
        originWhitelist={['*']}
      />
    </View>
  );
}

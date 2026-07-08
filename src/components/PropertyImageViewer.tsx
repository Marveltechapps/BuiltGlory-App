import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';

type PropertyImageViewerProps = {
  images: string[];
  visible: boolean;
  imageIndex?: number;
  onClose: () => void;
  onImageIndexChange?: (index: number) => void;
};

export function PropertyImageViewer({
  images,
  visible,
  imageIndex = 0,
  onClose,
  onImageIndexChange,
}: PropertyImageViewerProps) {
  const insets = useSafeAreaInsets();
  const viewerImages = useMemo(() => {
    const seen = new Set<string>();
    return images
      .filter(Boolean)
      .filter((uri) => {
        if (seen.has(uri)) return false;
        seen.add(uri);
        return true;
      })
      .map((uri) => ({ uri }));
  }, [images]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!visible || !viewerImages.length) return;
    const nextIndex = Math.min(Math.max(imageIndex, 0), viewerImages.length - 1);
    setCurrentIndex(nextIndex);
  }, [imageIndex, visible, viewerImages.length]);

  if (!viewerImages.length) return null;

  const handleIndexChange = (index: number) => {
    setCurrentIndex(index);
    onImageIndexChange?.(index);
  };

  return (
    <ImageViewing
      images={viewerImages}
      imageIndex={currentIndex}
      visible={visible}
      onRequestClose={onClose}
      onImageIndexChange={handleIndexChange}
      keyExtractor={(_, index) => `property-image-${index}`}
      swipeToCloseEnabled
      doubleTapToZoomEnabled
      presentationStyle="overFullScreen"
      animationType="fade"
      HeaderComponent={() => (
        <View
          className="absolute left-0 right-0 flex-row items-center justify-between px-4"
          style={{ top: insets.top + 8 }}
          pointerEvents="box-none"
        >
          <View />
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close image viewer"
            className="w-11 h-11 rounded-full bg-black/55 items-center justify-center"
          >
            <Icon name="x" size={22} color="white" strokeWidth={2.5} />
          </Pressable>
        </View>
      )}
      FooterComponent={({ imageIndex: idx }) => (
        viewerImages.length > 1 ? (
          <View
            className="absolute left-0 right-0 items-center"
            style={{ bottom: insets.bottom + 20 }}
            pointerEvents="none"
          >
            <View className="bg-black/55 px-3 py-1.5 rounded-full">
              <Text className="text-white text-[13px] font-medium">
                {idx + 1} / {viewerImages.length}
              </Text>
            </View>
          </View>
        ) : (
          <View />
        )
      )}
    />
  );
}

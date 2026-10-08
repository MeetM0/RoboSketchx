import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Layout, Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { IconButton } from './button';
import { useIsWide } from './screen';
import { Text } from './text';

/** Bottom sheet on phones, centred dialog on wide screens. */
export function Sheet({
  visible,
  title,
  description,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useIsWide();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, wide && styles.backdropWide]}>
        <Pressable
          accessibilityLabel="Close"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          role="dialog"
          aria-label={title}
          style={[
            styles.sheet,
            wide ? styles.sheetWide : { paddingBottom: Space.lg + insets.bottom },
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="section">{title}</Text>
              {description && (
                <Text variant="secondary" tone="secondary">
                  {description}
                </Text>
              )}
            </View>
            <IconButton icon="xmark" label="Close" variant="tertiary" onPress={onClose} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropWide: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Space.xl,
  },
  sheet: {
    gap: Space.lg,
    padding: Space.lg,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderWidth: 1,
    width: '100%',
    maxWidth: Layout.maxContent,
    alignSelf: 'center',
  },
  sheetWide: {
    maxWidth: 440,
    borderRadius: Radius.sheet,
    padding: Space.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
  },
  headerText: {
    flex: 1,
    gap: Space.xs,
    paddingTop: Space.sm,
  },
});

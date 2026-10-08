import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Layout, Space } from '@/constants/theme';
import { useHasHydrated } from '@/hooks/use-has-hydrated';
import { useTheme } from '@/hooks/use-theme';

import { IconButton } from './button';
import { Text } from './text';

/** Whether the window is wide enough for two-column layouts. */
export function useIsWide() {
  const width = useWindowDimensions().width;
  // Static web HTML is rendered without a window; lay out for phones until hydrated.
  const hydrated = useHasHydrated();
  return hydrated && width >= Layout.wideBreakpoint;
}

function Header({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const colors = useTheme();
  return (
    <View
      style={[styles.headerBar, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
      <View style={[styles.header, styles.wideContainer]}>
        {onBack && (
          <IconButton icon="chevron.left" label="Back" variant="tertiary" onPress={onBack} />
        )}
        <Text variant="title" style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
    </View>
  );
}

/** A single-column page: header, scrolling content capped at a readable width. */
export function Screen({
  title,
  onBack,
  headerRight,
  children,
}: {
  title: string;
  onBack?: () => void;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const colors = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Header title={title} onBack={onBack} right={headerRight} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, styles.readable]}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * A creation screen (choose → preview → send). Phones: the preview stage on top, controls
 * below it, and the action bar pinned to the bottom. Wide windows: the stage fills the left,
 * controls and the action bar sit in a column on the right — the action is always visible.
 */
export function Workspace({
  title,
  headerRight,
  toolbar,
  stage,
  footer,
  children,
}: {
  title: string;
  headerRight?: ReactNode;
  /** Mode switch shown under the header. */
  toolbar?: ReactNode;
  stage: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const colors = useTheme();
  const wide = useIsWide();
  const { height } = useWindowDimensions();
  const hydrated = useHasHydrated();
  // Static web HTML has no window height; use a typical phone's until hydrated.
  const stageHeight = Math.round(Math.min(Math.max((hydrated ? height : 844) * 0.42, 240), 420));

  if (wide) {
    return (
      <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.bg }]}>
        <Header title={title} right={headerRight} />
        <View style={[styles.wideBody, styles.wideContainer]}>
          <View
            style={[
              styles.wideStage,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}>
            {stage}
          </View>
          <View
            style={[styles.side, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <ScrollView
              style={styles.screen}
              contentContainerStyle={styles.sideContent}
              keyboardShouldPersistTaps="handled">
              {toolbar}
              {children}
            </ScrollView>
            {footer}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Header title={title} right={headerRight} />
      <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={[styles.readable, styles.narrowBody]}>
          {toolbar}
          <View
            style={[
              styles.narrowStage,
              // Keep the controls in view below the paper.
              {
                height: stageHeight,
              },
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}>
            {stage}
          </View>
          {children}
        </View>
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Layout.gutter,
    paddingVertical: Space.xs,
  },
  headerTitle: {
    flex: 1,
  },
  readable: {
    width: '100%',
    maxWidth: Layout.maxContent,
    alignSelf: 'center',
  },
  wideContainer: {
    width: '100%',
    maxWidth: Layout.maxWide,
    alignSelf: 'center',
  },
  content: {
    padding: Layout.gutter,
    paddingBottom: Space.xxxl,
    gap: Space.xl,
  },
  narrowBody: {
    padding: Layout.gutter,
    paddingBottom: Space.xl,
    gap: Space.xl,
  },
  narrowStage: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  wideBody: {
    flex: 1,
    flexDirection: 'row',
    gap: Space.xl,
    padding: Space.xl,
  },
  wideStage: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  side: {
    width: Layout.sideColumn,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  sideContent: {
    padding: Space.xl,
    gap: Space.xl,
  },
});

import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRateArtist, useRateLivePerformance } from '../api/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { Button } from './ui';

/**
 * Rating sheet, used for both the overall artist rating and the post-show live
 * rating. They are separate ratings on the server and stay separate here — the
 * copy says which one is being given, so nobody rates the wrong thing.
 */
export function RatingSheet({
  visible,
  onClose,
  artistId,
  artistName,
  eventId,
  eventTitle,
}: {
  visible: boolean;
  onClose: () => void;
  artistId?: string;
  artistName?: string;
  /** When present, this is a live performance rating rather than an overall one. */
  eventId?: string;
  eventTitle?: string;
}) {
  const { t } = useTranslation();
  const [score, setScore] = useState(0);
  const [review, setReview] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rateArtist = useRateArtist(artistId ?? '');
  const rateLive = useRateLivePerformance(eventId ?? '');
  const mutation = eventId ? rateLive : rateArtist;

  const submit = () => {
    if (score < 1) return;
    setError(null);
    mutation.mutate(
      { score, reviewText: review.trim() || undefined },
      {
        onSuccess: () => {
          setScore(0);
          setReview('');
          onClose();
        },
        // The 24-hour account age rule is enforced server-side; surface its
        // message rather than inventing a vaguer one here.
        onError: (err) => setError((err as Error).message),
      },
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />

      <View style={styles.sheet}>
        <Text style={styles.title}>
          {eventId ? t('rating.liveTitle') : t('rating.title', { name: artistName ?? '' })}
        </Text>

        {eventId && eventTitle ? (
          <Text style={styles.subtitle}>{t('rating.liveSubtitle', { title: eventTitle })}</Text>
        ) : null}

        <View style={styles.stars} accessibilityRole="adjustable">
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`${value}`}
              accessibilityState={{ selected: score >= value }}
              onPress={() => setScore(value)}
              hitSlop={8}
            >
              <Text style={[styles.star, score >= value && styles.starActive]}>★</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={review}
          onChangeText={setReview}
          placeholder={t('rating.reviewPlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          multiline
          maxLength={1000}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={t('rating.submit')}
          onPress={submit}
          disabled={score < 1}
          loading={mutation.isPending}
        />
        <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.md,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
  stars: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  star: { fontSize: 36, color: colors.border },
  starActive: { color: colors.accent },
  input: {
    minHeight: 84,
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.text,
    ...typography.body,
    textAlignVertical: 'top',
  },
  error: { ...typography.caption, color: colors.statusCancelled },
});

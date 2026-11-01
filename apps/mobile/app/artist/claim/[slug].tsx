import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useArtist, useClaimArtist, useMe } from '../../../src/api/hooks';
import { Button, EmptyState, ErrorState, Loading, Screen } from '../../../src/components/ui';
import { colors, radii, spacing, typography } from '../../../src/theme';

/** Mirrors the API's limits so the button state matches what the server accepts. */
const EVIDENCE_MIN = 20;
const EVIDENCE_MAX = 2000;

/** People paste "instagram.com/name"; the API needs an absolute URL. */
function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * Claim-your-profile.
 *
 * Verification is manual and the copy says so up front: someone at Onstage
 * checks each claim through a channel the artist controls, so the user knows a
 * reply can take days rather than expecting an instant switch-over.
 */
export default function ClaimArtistScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();
  const router = useRouter();

  const artist = useArtist(String(slug));
  const me = useMe();
  const claim = useClaimArtist(artist.data?.id ?? '', String(slug));

  const [evidence, setEvidence] = useState('');
  const [contactUrl, setContactUrl] = useState('');

  if (artist.isLoading || me.isLoading) return <Loading />;
  if (artist.isError || !artist.data) {
    return (
      <Screen>
        <ErrorState
          message={(artist.error as Error)?.message ?? 'Artist not found.'}
          onRetry={() => void artist.refetch()}
        />
      </Screen>
    );
  }

  const data = artist.data;

  // Signed out is a normal state: say why an account is needed, then send them to sign in.
  if (me.isError || !me.data) {
    return (
      <Screen>
        <EmptyState
          title={t('claim.signInTitle')}
          body={t('claim.signInBody')}
          action={
            <Button label={t('profile.signIn')} onPress={() => router.push('/auth/sign-in')} />
          }
        />
      </Screen>
    );
  }

  if (data.viewerManages) {
    return (
      <Screen>
        <EmptyState
          title={t('claim.managesTitle')}
          body={t('claim.managesBody')}
          action={
            <Button
              label={t('artist.editProfile')}
              onPress={() => router.replace(`/artist/edit/${data.slug}`)}
            />
          }
        />
      </Screen>
    );
  }

  if (data.viewerClaimStatus === 'pending' || claim.isSuccess) {
    return (
      <Screen>
        <EmptyState
          title={t('claim.pendingTitle')}
          body={t('claim.pendingBody')}
          action={
            <Button label={t('common.done')} variant="secondary" onPress={() => router.back()} />
          }
        />
      </Screen>
    );
  }

  const trimmed = evidence.trim();
  const submit = () =>
    claim.mutate({
      evidence: trimmed,
      contactUrl: contactUrl.trim() ? withScheme(contactUrl.trim()) : undefined,
    });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('claim.title', { name: data.name })}</Text>
        <Text style={styles.body}>{t('claim.intro', { name: data.name })}</Text>

        {data.viewerClaimStatus === 'rejected' ? (
          <Text style={styles.notice}>{t('claim.rejectedNotice')}</Text>
        ) : null}

        <Text style={styles.label}>{t('claim.evidenceLabel')}</Text>
        <TextInput
          value={evidence}
          onChangeText={setEvidence}
          placeholder={t('claim.evidencePlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.multiline]}
          multiline
          maxLength={EVIDENCE_MAX}
          accessibilityLabel={t('claim.evidenceLabel')}
        />
        <Text style={styles.hint}>{t('claim.evidenceHint', { min: EVIDENCE_MIN })}</Text>

        <Text style={styles.label}>{t('claim.contactLabel')}</Text>
        <TextInput
          value={contactUrl}
          onChangeText={setContactUrl}
          placeholder={t('claim.contactPlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel={t('claim.contactLabel')}
        />

        {claim.isError ? <Text style={styles.error}>{(claim.error as Error).message}</Text> : null}

        <Button
          label={t('claim.submit')}
          onPress={submit}
          disabled={trimmed.length < EVIDENCE_MIN}
          loading={claim.isPending}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  label: { ...typography.label, color: colors.text, marginTop: spacing.sm },
  hint: { ...typography.caption, color: colors.textFaint },
  input: {
    minHeight: 48,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  multiline: { minHeight: 120, paddingTop: spacing.md, textAlignVertical: 'top' },
  notice: {
    ...typography.caption,
    color: colors.warning,
    backgroundColor: colors.warningSurface,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
  error: {
    ...typography.caption,
    color: colors.statusCancelled,
    backgroundColor: colors.warningSurface,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
});

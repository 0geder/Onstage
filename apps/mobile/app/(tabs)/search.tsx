import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useArtistSearch } from '../../src/api/hooks';
import { clearRecentSearches, recentSearches, rememberSearch } from '../../src/api/client';
import { SearchResultRow } from '../../src/components/cards';
import { EmptyState, Loading, Screen } from '../../src/components/ui';
import { colors, radii, spacing, typography } from '../../src/theme';

/** Debounce: search on the pause in typing, not on every keystroke. */
const DEBOUNCE_MS = 250;

export default function SearchScreen() {
  const { t } = useTranslation();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    void recentSearches().then(setRecent);
  }, []);

  const search = useArtistSearch(debounced);

  // Only remember a term that actually found something — remembering typos that
  // led nowhere would make the list useless.
  useEffect(() => {
    if (debounced.trim().length >= 2 && (search.data?.length ?? 0) > 0) {
      void rememberSearch(debounced).then(() => recentSearches().then(setRecent));
    }
  }, [debounced, search.data]);

  const showRecent = term.trim().length < 2 && recent.length > 0;

  return (
    <Screen>
      <View style={styles.searchBar}>
        <Text style={styles.searchGlyph}>⌕</Text>
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder={t('search.placeholder')}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={t('search.placeholder')}
          clearButtonMode="while-editing"
        />
      </View>

      {showRecent ? (
        <View>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>{t('search.recent')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void clearRecentSearches().then(() => setRecent([]))}
            >
              <Text style={styles.clear}>{t('search.clearRecent')}</Text>
            </Pressable>
          </View>

          {recent.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              onPress={() => setTerm(item)}
              style={({ pressed }) => [styles.recentRow, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.recentText}>{item}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {search.isLoading && debounced.trim().length >= 2 ? <Loading /> : null}

      {!search.isLoading && debounced.trim().length >= 2 && (search.data?.length ?? 0) === 0 ? (
        <EmptyState
          title={t('search.noResults', { query: debounced })}
          body={t('search.noResultsHint')}
        />
      ) : null}

      <FlatList
        data={search.data ?? []}
        keyExtractor={(item) => item.artist.id}
        renderItem={({ item }) => <SearchResultRow result={item} />}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchGlyph: { color: colors.textFaint, fontSize: 18 },
  input: { flex: 1, height: 46, color: colors.text, ...typography.body },

  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  recentTitle: { ...typography.label, color: colors.textFaint },
  clear: { ...typography.label, color: colors.accent },
  recentRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  recentText: { ...typography.body, color: colors.textMuted },
});

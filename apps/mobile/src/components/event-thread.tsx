import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  COMMENT_TAGS,
  REPORT_REASONS,
  formatRelativeTime,
  type CommentSort,
  type CommentTag,
  type CommentThread as ThreadKind,
  type ThreadComment,
} from '@onstage/shared';
import { useLikeComment, usePostComment, useReportComment, useThread } from '../api/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { Avatar, Chip, ChipRow, EmptyState, Loading, SectionHeading, WarningBanner } from './ui';

/**
 * The event thread.
 *
 * Two conversations: planning before the show, recap after it starts. Tag
 * filters sit at the top, and the resale warning is permanently visible and
 * cannot be dismissed — it is the only protection a user has in a transaction
 * Onstage is not party to.
 */
export function EventThread({
  eventId,
  startsAt,
  initialTag,
  onTagChange,
}: {
  eventId: string;
  startsAt: string;
  initialTag?: CommentTag;
  onTagChange?: (tag: CommentTag | undefined) => void;
}) {
  const { t } = useTranslation();

  const [kind, setKind] = useState<ThreadKind>('planning');
  const [tag, setTag] = useState<CommentTag | undefined>(initialTag);
  const [sort, setSort] = useState<CommentSort>('top');
  const [body, setBody] = useState('');
  const [composerTag, setComposerTag] = useState<CommentTag>('none');
  const [replyTo, setReplyTo] = useState<ThreadComment | null>(null);

  // The event page flips to the have_tickets filter when a show is sold out.
  // Adjusted during render rather than in an effect, so there is no extra pass.
  const [lastInitialTag, setLastInitialTag] = useState(initialTag);
  if (initialTag !== lastInitialTag) {
    setLastInitialTag(initialTag);
    if (initialTag !== undefined) setTag(initialTag);
  }

  const thread = useThread(eventId, { thread: kind, tag, sort });
  const post = usePostComment(eventId);
  const like = useLikeComment(eventId);

  const recapOpen = new Date(startsAt) <= new Date();

  const selectTag = (next?: CommentTag) => {
    setTag(next);
    onTagChange?.(next);
  };

  const submit = () => {
    const text = body.trim();
    if (text.length === 0) return;

    post.mutate(
      {
        body: text,
        tag: composerTag,
        thread: kind,
        parentCommentId: replyTo?.id,
      },
      {
        onSuccess: (comment) => {
          setBody('');
          setComposerTag('none');
          setReplyTo(null);
          // Auto-hidden posts are held for review. Saying so is better than
          // letting someone believe a comment is live when nobody can see it.
          if (comment.isHidden) {
            Alert.alert(
              t('thread.title'),
              'Your post has been held for review because it matched our scam patterns.',
            );
          }
        },
        onError: (error) => Alert.alert(t('thread.title'), (error as Error).message),
      },
    );
  };

  return (
    <View>
      <SectionHeading title={t('thread.title')} />

      <View style={styles.threadTabs}>
        <Chip
          label={t('thread.planning')}
          selected={kind === 'planning'}
          onPress={() => setKind('planning')}
        />
        <Chip
          label={t('thread.recap')}
          selected={kind === 'recap'}
          onPress={() => setKind('recap')}
        />
      </View>

      {kind === 'recap' && !recapOpen ? (
        <EmptyState title={t('thread.recapLocked')} />
      ) : (
        <>
          {thread.data?.notice ? <WarningBanner text={thread.data.notice} /> : null}

          <ChipRow>
            <Chip label={t('thread.tags.all')} selected={!tag} onPress={() => selectTag(undefined)} />
            {COMMENT_TAGS.filter((value) => value !== 'none').map((value) => (
              <Chip
                key={value}
                label={t(`thread.tags.${value}`)}
                selected={tag === value}
                onPress={() => selectTag(value)}
              />
            ))}
          </ChipRow>

          <View style={styles.sortRow}>
            <Chip label={t('thread.sortTop')} selected={sort === 'top'} onPress={() => setSort('top')} />
            <Chip
              label={t('thread.sortNewest')}
              selected={sort === 'newest'}
              onPress={() => setSort('newest')}
            />
          </View>

          <View style={styles.composer}>
            {replyTo ? (
              <View style={styles.replyingTo}>
                <Text style={styles.replyingText} numberOfLines={1}>
                  {t('thread.reply')} @{replyTo.author.handle}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => setReplyTo(null)}>
                  <Text style={styles.replyingCancel}>{t('common.cancel')}</Text>
                </Pressable>
              </View>
            ) : (
              <ChipRow>
                {COMMENT_TAGS.map((value) => (
                  <Chip
                    key={value}
                    label={t(`thread.tags.${value}`)}
                    selected={composerTag === value}
                    onPress={() => setComposerTag(value)}
                  />
                ))}
              </ChipRow>
            )}

            <View style={styles.composerRow}>
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder={t('thread.placeholder')}
                placeholderTextColor={colors.textFaint}
                style={styles.composerInput}
                multiline
                maxLength={2000}
                accessibilityLabel={t('thread.placeholder')}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('thread.post')}
                disabled={body.trim().length === 0 || post.isPending}
                onPress={submit}
                style={({ pressed }) => [
                  styles.postButton,
                  (body.trim().length === 0 || post.isPending) && { opacity: 0.4 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.postLabel}>{t('thread.post')}</Text>
              </Pressable>
            </View>
          </View>

          {thread.isLoading ? (
            <Loading />
          ) : (thread.data?.items.length ?? 0) === 0 ? (
            <EmptyState title={t('thread.empty')} />
          ) : (
            thread.data?.items.map((comment) => (
              <Comment
                key={comment.id}
                comment={comment}
                onReply={setReplyTo}
                onLike={(liked) => like.mutate({ commentId: comment.id, liked })}
              />
            ))
          )}
        </>
      )}
    </View>
  );
}

function Comment({
  comment,
  onReply,
  onLike,
  depth = 0,
}: {
  comment: ThreadComment;
  onReply: (comment: ThreadComment) => void;
  onLike: (liked: boolean) => void;
  depth?: number;
}) {
  const { t } = useTranslation();
  const report = useReportComment();

  const promptReport = () => {
    Alert.alert(
      t('thread.report'),
      undefined,
      [
        ...REPORT_REASONS.map((reason) => ({
          text: t(`thread.reportReasons.${reason}`),
          onPress: () =>
            report.mutate(
              { commentId: comment.id, reason },
              { onSuccess: () => Alert.alert(t('thread.reportThanks')) },
            ),
        })),
        { text: t('common.cancel'), style: 'cancel' as const },
      ],
    );
  };

  return (
    <View style={[styles.comment, depth > 0 && styles.reply]}>
      <Avatar uri={comment.author.avatar} size={32} label={comment.author.displayName} />

      <View style={{ flex: 1, gap: spacing.xs }}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentAuthor}>{comment.author.displayName}</Text>

          {/* Account age is shown next to resale tags, because "joined today" is
              the single most useful signal a buyer has. */}
          {comment.author.accountAgeDays < 1 &&
          (comment.tag === 'have_tickets' || comment.tag === 'want_tickets') ? (
            <Text style={styles.newAccount}>{t('thread.newAccount')}</Text>
          ) : null}

          <Text style={styles.commentTime}>{formatRelativeTime(comment.createdAt)}</Text>
        </View>

        {comment.tag !== 'none' ? (
          <Text style={styles.commentTag}>{t(`thread.tags.${comment.tag}`)}</Text>
        ) : null}

        <Text style={[styles.commentBody, comment.isHidden && styles.commentHidden]}>
          {comment.isHidden ? t('thread.removed') : comment.body}
        </Text>

        <View style={styles.commentActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${comment.likeCount}`}
            onPress={() => onLike(comment.viewerHasLiked)}
          >
            <Text style={[styles.action, comment.viewerHasLiked && { color: colors.accent }]}>
              ♥ {comment.likeCount}
            </Text>
          </Pressable>

          {depth === 0 ? (
            <Pressable accessibilityRole="button" onPress={() => onReply(comment)}>
              <Text style={styles.action}>{t('thread.reply')}</Text>
            </Pressable>
          ) : null}

          <Pressable accessibilityRole="button" onPress={promptReport}>
            <Text style={styles.action}>{t('thread.report')}</Text>
          </Pressable>
        </View>

        {comment.replies?.map((reply) => (
          <Comment
            key={reply.id}
            comment={reply}
            onReply={onReply}
            onLike={onLike}
            depth={depth + 1}
          />
        ))}

        {comment.replyCount > (comment.replies?.length ?? 0) ? (
          <Text style={styles.moreReplies}>
            {t('thread.replies', { count: comment.replyCount })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  threadTabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  sortRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },

  composer: { paddingVertical: spacing.md, gap: spacing.sm },
  composerRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    ...typography.body,
  },
  postButton: {
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
  },
  postLabel: { ...typography.label, color: colors.onAccent },

  replyingTo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  replyingText: { ...typography.caption, color: colors.textMuted },
  replyingCancel: { ...typography.caption, color: colors.accent },

  comment: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  reply: { paddingLeft: 0, paddingRight: 0, paddingTop: spacing.md, paddingBottom: 0 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  commentAuthor: { ...typography.label, color: colors.text },
  newAccount: {
    ...typography.caption,
    color: colors.warning,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
  },
  commentTime: { ...typography.caption, color: colors.textFaint },
  commentTag: { ...typography.caption, color: colors.accent, fontWeight: '600' },
  commentBody: { ...typography.body, color: colors.text, lineHeight: 21 },
  commentHidden: { color: colors.textFaint, fontStyle: 'italic' },
  commentActions: { flexDirection: 'row', gap: spacing.lg, paddingTop: spacing.xs },
  action: { ...typography.caption, color: colors.textMuted },
  moreReplies: { ...typography.caption, color: colors.accent, paddingTop: spacing.xs },
});

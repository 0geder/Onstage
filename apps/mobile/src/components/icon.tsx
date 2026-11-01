import { Image } from 'expo-image';
import type { ColorValue } from 'react-native';
import { colors } from '../theme';

/**
 * Line icons from Lucide (ISC), bundled as white PNGs and tinted here, so the
 * set needs no native module. Regenerate the set rather than editing a PNG.
 */
const ICONS = {
  home: require('../../assets/icons/home.png'),
  'home-fill': require('../../assets/icons/home-fill.png'),
  search: require('../../assets/icons/search.png'),
  plans: require('../../assets/icons/plans.png'),
  profile: require('../../assets/icons/profile.png'),
  'profile-fill': require('../../assets/icons/profile-fill.png'),
  heart: require('../../assets/icons/heart.png'),
  'heart-fill': require('../../assets/icons/heart-fill.png'),
  comment: require('../../assets/icons/comment.png'),
  share: require('../../assets/icons/share.png'),
  close: require('../../assets/icons/close.png'),
  ticket: require('../../assets/icons/ticket.png'),
  live: require('../../assets/icons/live.png'),
  pin: require('../../assets/icons/pin.png'),
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 24,
  color = colors.text,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  return (
    <Image
      source={ICONS[name]}
      style={{ width: size, height: size }}
      tintColor={color as string}
      contentFit="contain"
      // Icons sit beside a label or inside a control that carries its own.
      accessible={false}
    />
  );
}

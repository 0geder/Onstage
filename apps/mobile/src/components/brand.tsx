import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

/**
 * Logos for the services Onstage hands people off to.
 *
 * Shown beside the service's name, never instead of it, so the label is still
 * read out by screen readers and still there if an icon is missing. Simple
 * Icons (CC0) glyphs for most; the rest are the official icons published on
 * each company's own site. Regenerate the set rather than editing a PNG.
 */
const ICONS = {
  spotify: require('../../assets/brands/spotify.png'),
  apple_music: require('../../assets/brands/apple_music.png'),
  youtube: require('../../assets/brands/youtube.png'),
  soundcloud: require('../../assets/brands/soundcloud.png'),
  audiomack: require('../../assets/brands/audiomack.png'),
  uber: require('../../assets/brands/uber.png'),
  bolt: require('../../assets/brands/bolt.png'),
  indrive: require('../../assets/brands/indrive.png'),
  google_maps: require('../../assets/brands/google_maps.png'),
  ticketmaster: require('../../assets/brands/ticketmaster.png'),
  quicket: require('../../assets/brands/quicket.png'),
  webtickets: require('../../assets/brands/webtickets.png'),
  computicket: require('../../assets/brands/computicket.png'),
  howler: require('../../assets/brands/howler.png'),
  facebook: require('../../assets/brands/facebook.png'),
  instagram: require('../../assets/brands/instagram.png'),
  tiktok: require('../../assets/brands/tiktok.png'),
  twitch: require('../../assets/brands/twitch.png'),
} as const;

export type Brand = keyof typeof ICONS;

export function isBrand(key: string): key is Brand {
  return key in ICONS;
}

export function BrandIcon({ brand, size = 20 }: { brand: Brand; size?: number }) {
  return (
    <Image
      source={ICONS[brand]}
      style={[styles.icon, { width: size, height: size, borderRadius: size * 0.22 }]}
      contentFit="contain"
      // Decorative: the brand's name is always rendered next to it.
      accessible={false}
    />
  );
}

const styles = StyleSheet.create({
  icon: { overflow: 'hidden' },
});

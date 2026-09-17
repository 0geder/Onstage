/**
 * Visual language.
 *
 * Dark by default: this app is used in dim rooms, in queues, on the way to a
 * venue at night. A light theme would be the wrong default for the context.
 */

export const colors = {
  background: '#0B0B0F',
  surface: '#15151C',
  surfaceRaised: '#1E1E28',
  border: '#2A2A36',

  text: '#F5F5F7',
  textMuted: '#9A9AA8',
  textFaint: '#6B6B7B',

  accent: '#FF4D6D',
  accentMuted: '#3A1620',
  onAccent: '#FFFFFF',

  // Availability badges. Sold out is deliberately not red — it is a neutral
  // fact, and red here would read as an error rather than as information.
  statusAnnounced: '#7C8CF8',
  statusOnSale: '#3DD68C',
  statusLowStock: '#F5A524',
  statusSoldOut: '#9A9AA8',
  statusCancelled: '#F04438',

  promoted: '#C6A15B',
  warning: '#F5A524',
  warningSurface: '#2A2113',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
} as const;

import type { EventStatus } from '@onstage/shared';

export function statusColour(status: EventStatus): string {
  switch (status) {
    case 'on_sale':
      return colors.statusOnSale;
    case 'low_stock':
      return colors.statusLowStock;
    case 'sold_out':
      return colors.statusSoldOut;
    case 'cancelled':
      return colors.statusCancelled;
    case 'postponed':
      return colors.warning;
    default:
      return colors.statusAnnounced;
  }
}

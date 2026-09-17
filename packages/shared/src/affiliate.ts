import type { TicketProvider } from './enums';

/**
 * Affiliate attribution on outbound ticket links.
 *
 * Onstage processes no payment. These parameters exist so that a purchase made
 * on the provider's own site can be attributed back to the referral, which is
 * how the link-out model earns anything at all. Each provider names its
 * parameter differently, so the mapping is explicit rather than guessed.
 *
 * Confirm the correct parameter with each provider's affiliate programme before
 * enabling it — an unrecognised parameter is harmless, but a wrong one can
 * break their checkout.
 */
export interface AffiliateConfig {
  /** Per-provider query parameter name, e.g. { quicket: 'ref' }. */
  parameters: Partial<Record<TicketProvider, string>>;
  /** The affiliate identifier Onstage was issued. */
  affiliateId: string;
  /** Extra parameters applied to every provider, typically UTM tags. */
  common?: Record<string, string>;
}

export interface ClickContext {
  eventId: string;
  ticketOptionId: string;
  /** Opaque id for the click record, so a conversion can be traced back. */
  clickId?: string;
}

/**
 * Returns the purchase URL with attribution applied.
 *
 * Any parameter the provider already set is preserved — never overwrite a URL a
 * promoter built deliberately.
 */
export function withAffiliateTag(
  purchaseUrl: string,
  provider: TicketProvider,
  config: AffiliateConfig | null,
  context?: ClickContext,
): string {
  if (!config?.affiliateId) return purchaseUrl;

  let url: URL;
  try {
    url = new URL(purchaseUrl);
  } catch {
    // A malformed provider URL is passed through untouched rather than dropped:
    // a link that might work beats no link at all.
    return purchaseUrl;
  }

  const parameter = config.parameters[provider];
  if (parameter && !url.searchParams.has(parameter)) {
    url.searchParams.set(parameter, config.affiliateId);
  }

  for (const [key, value] of Object.entries(config.common ?? {})) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }

  if (context?.clickId && !url.searchParams.has('onstage_click')) {
    url.searchParams.set('onstage_click', context.clickId);
  }

  return url.toString();
}

/** Default UTM tags, so provider-side analytics can see where traffic came from. */
export const DEFAULT_UTM: Record<string, string> = {
  utm_source: 'onstage',
  utm_medium: 'referral',
};

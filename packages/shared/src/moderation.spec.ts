import { AUTO_HIDE_THRESHOLD, REVIEW_THRESHOLD, scoreComment } from './moderation';
import { normaliseName, slugify, formatMoney, formatPriceRange } from './format';
import { haversineKm } from './geo';
import { withAffiliateTag, DEFAULT_UTM } from './affiliate';
import { badgesForStreak } from './growth';

const baseline = {
  tag: 'none',
  accountAgeHours: 500,
  recentCommentCount: 1,
  duplicateBodyCount: 0,
};

describe('scam scoring', () => {
  it('leaves an ordinary comment alone', () => {
    const { score, signals } = scoreComment({
      ...baseline,
      body: 'Does anyone know what time doors open? Trying to sort out a lift.',
    });
    expect(score).toBe(0);
    expect(signals).toHaveLength(0);
  });

  it('does not punish a legitimate resale offer from an established account', () => {
    const { score } = scoreComment({
      ...baseline,
      tag: 'have_tickets',
      body: 'Have two lawn tickets I can no longer use. Happy to transfer through the official app.',
    });
    expect(score).toBeLessThan(REVIEW_THRESHOLD);
  });

  it('hides the classic advance-fee pattern from a new account', () => {
    const { score, signals } = scoreComment({
      ...baseline,
      tag: 'have_tickets',
      accountAgeHours: 2,
      body: 'SELLING 4 TICKETS! Pay by EFT first and I send immediately. WhatsApp me on 082 555 1234, going fast',
    });

    expect(score).toBeGreaterThanOrEqual(AUTO_HIDE_THRESHOLD);
    expect(signals.map((signal) => signal.code)).toEqual(
      expect.arrayContaining(['upfront_payment', 'offsite_contact', 'new_account_selling']),
    );
  });

  it('flags a crypto wallet address', () => {
    const { score, signals } = scoreComment({
      ...baseline,
      body: 'Send payment to 0x52908400098527886E0F7030069857D2E4169EE7 and I will release the ticket',
    });
    expect(signals.map((s) => s.code)).toContain('crypto_wallet');
    expect(score).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
  });

  it('catches repeated identical posts', () => {
    const { signals } = scoreComment({
      ...baseline,
      body: 'tickets available dm me',
      duplicateBodyCount: 3,
    });
    expect(signals.map((s) => s.code)).toContain('duplicate_posts');
  });

  it('caps the score at 100', () => {
    const { score } = scoreComment({
      ...baseline,
      tag: 'have_tickets',
      accountAgeHours: 1,
      duplicateBodyCount: 5,
      recentCommentCount: 40,
      body: 'urgent quick sale pay first via PayPal, whatsapp 0825551234, 0x52908400098527886E0F7030069857D2E4169EE7',
    });
    expect(score).toBe(100);
  });
});

describe('name normalisation', () => {
  it('collapses the variants providers actually send', () => {
    expect(normaliseName('DJ Maphorisa (Live)')).toBe('dj maphorisa');
    expect(normaliseName('  The   Kalk Bay Collective ')).toBe('kalk bay collective');
    expect(normaliseName('Beyoncé')).toBe('beyonce');
    expect(normaliseName('Simon & Garfunkel')).toBe('simon and garfunkel');
  });

  it('gives the same key to differently punctuated spellings', () => {
    expect(normaliseName('A$AP Rocky')).toBe(normaliseName('ASAP Rocky'));
  });
});

describe('slugify', () => {
  it('produces URL-safe slugs', () => {
    expect(slugify('Nomvula Dlamini — Homecoming')).toBe('nomvula-dlamini-homecoming');
    expect(slugify('!!!')).toBe('');
  });
});

describe('money formatting', () => {
  it('renders minor units as rands', () => {
    expect(formatMoney(45000)).toContain('450');
    expect(formatPriceRange(null)).toBe('Price not listed');
    expect(formatPriceRange({ minMinor: 45000, maxMinor: 45000, currency: 'ZAR' })).not.toContain('–');
    expect(formatPriceRange({ minMinor: 45000, maxMinor: 89000, currency: 'ZAR' })).toContain('–');
  });
});

describe('haversine', () => {
  it('measures the Cape Town to Johannesburg distance', () => {
    const km = haversineKm({ lat: -33.9249, lng: 18.4241 }, { lat: -26.2041, lng: 28.0473 });
    expect(km).toBeGreaterThan(1250);
    expect(km).toBeLessThan(1300);
  });

  it('returns zero for the same point', () => {
    expect(haversineKm({ lat: -33.9, lng: 18.4 }, { lat: -33.9, lng: 18.4 })).toBe(0);
  });
});

describe('affiliate tagging', () => {
  const config = {
    affiliateId: 'onstage-1',
    parameters: { quicket: 'ref' as const },
    common: DEFAULT_UTM,
  };

  it('adds the provider parameter and UTM tags', () => {
    const url = withAffiliateTag('https://quicket.co.za/events/1', 'quicket', config);
    expect(url).toContain('ref=onstage-1');
    expect(url).toContain('utm_source=onstage');
  });

  it('never overwrites a parameter the promoter already set', () => {
    const url = withAffiliateTag('https://quicket.co.za/events/1?ref=promoter', 'quicket', config);
    expect(url).toContain('ref=promoter');
    expect(url).not.toContain('ref=onstage-1');
  });

  it('passes the URL through untouched when affiliation is disabled', () => {
    const url = 'https://quicket.co.za/events/1';
    expect(withAffiliateTag(url, 'quicket', null)).toBe(url);
  });

  it('does not drop a malformed provider URL', () => {
    expect(withAffiliateTag('not-a-url', 'quicket', config)).toBe('not-a-url');
  });
});

describe('attendance badges', () => {
  it('awards cumulatively by streak length', () => {
    expect(badgesForStreak(0)).toEqual([]);
    expect(badgesForStreak(1)).toEqual(['first_show']);
    expect(badgesForStreak(6)).toEqual(['first_show', 'regular', 'season_ticket']);
  });
});

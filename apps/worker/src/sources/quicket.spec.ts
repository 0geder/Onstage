import { findActs, parseQuicketTime } from './quicket';

/** How acts are read out of Quicket's free-text event titles. */
describe('findActs', () => {
  const artists = new Map([
    ['prime circle', 'Prime Circle'],
    ['jack parow', 'Jack Parow'],
    ['van pletzen', 'Van Pletzen'],
    ['dr victor', 'Dr Victor'],
    ['dr victor and the rasta rebels', 'Dr Victor & the Rasta Rebels'],
    ['revolution', 'Revolution'],
    ['megalodon', 'Megalodon'],
  ]);

  it('finds a known artist inside the title', () => {
    expect(findActs('PRIME CIRCLE LIVE at AVIATORS HARTIES', artists)).toEqual(['Prime Circle']);
  });

  it('keeps every known act on a shared bill', () => {
    expect(
      findActs('KAKGROOT HALLOWEEN JOL - Van Pletzen, Jack Parow & Sossi at X', artists),
    ).toEqual(['Van Pletzen', 'Jack Parow']);
  });

  it('prefers the full band name over a shorter one inside it', () => {
    expect(findActs("Dance Cafe's Halloween With Dr Victor & The Rasta Rebels", artists)).toEqual([
      'Dr Victor & the Rasta Rebels',
    ]);
  });

  it('reads an unknown act from "<act> at <place>"', () => {
    expect(findActs('DEREK SASSEN AT VREDENHOF ORGANIC FARM', artists)).toEqual(['Derek Sassen']);
    expect(findActs('Slow Life presents Bokani Dyer at The Brass Room', artists)).toEqual([
      'Bokani Dyer',
    ]);
    expect(findActs('Crimson House LIVE! @ Cafe Roux', artists)).toEqual(['Crimson House']);
  });

  it('only counts a one-word name where the title bills an act', () => {
    expect(findActs('IMVUSELELO: THE REVOLUTION IS NOW', artists)).toEqual([]);
    expect(findActs('METAL BREAKDOWN Vol.1 @ Springbok Arms ft. Megalodon', artists)).toEqual([
      'Megalodon',
    ]);
  });

  it('takes the featured act from "<show> ft <act>"', () => {
    expect(findActs('ABBA-SOLUTELY FABULOUS ft Aaron McIlroy at The Barnyard', artists)).toEqual([
      'Aaron McIlroy',
    ]);
  });

  it('splits billed acts on colons, pipes and commas', () => {
    expect(findActs('Fuzznights: Sueños | Phakathi LIVE at Surfa Rosa', artists)).toEqual([
      'Sueños',
      'Phakathi',
    ]);
    expect(
      findActs('Gerhard Joubert, intimate solo recital at Ian Burgess-Simpson Pianos', artists),
    ).toEqual(['Gerhard Joubert']);
  });

  it('skips listings that name an event, not an act', () => {
    expect(findActs("ZAR CANCER FUNDRAISER HOSTED @ NOAH'S PUB AND LOUNGE", artists)).toEqual([]);
    expect(findActs('Carols at Church Alive North', artists)).toEqual([]);
    expect(findActs('Undisclosed LIVE! @ café Roux', artists)).toEqual([]);
    expect(findActs('Oktoberfest at the Outspan', artists)).toEqual([]);
    expect(findActs("Thursday 10th of December at Hugh's Jazz Club", artists)).toEqual([]);
    expect(findActs('Retro Groove 30+ Party: Fright at the Prom', artists)).toEqual([]);
    expect(findActs('Shades and vibes', artists)).toEqual([]);
    expect(findActs('Halloween Night at Club Paradise', artists)).toEqual([]);
  });
});

describe('parseQuicketTime', () => {
  it('reads offset-less times as South African time, whatever the server zone', () => {
    expect(parseQuicketTime('2026-12-19T00:30:00')?.toISOString()).toBe('2026-12-18T22:30:00.000Z');
  });

  it('keeps an explicit offset', () => {
    expect(parseQuicketTime('2026-12-19T00:30:00Z')?.toISOString()).toBe(
      '2026-12-19T00:30:00.000Z',
    );
  });

  it('returns null for missing or broken values', () => {
    expect(parseQuicketTime(undefined)).toBeNull();
    expect(parseQuicketTime('not a date')).toBeNull();
  });
});

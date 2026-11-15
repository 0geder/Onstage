import type { FetchWindow, SweepReport } from './types';

/**
 * Adapters that move on past a failed page must say the pass was partial,
 * because the pipeline retires listings missing from a complete pass.
 */

jest.mock('../config', () => ({
  config: {
    providers: {
      quicket: { enabled: true, baseUrl: 'https://quicket.test', apiKey: 'key' },
      ticketmaster: { enabled: true, baseUrl: 'https://tm.test', apiKey: 'key' },
    },
  },
}));
jest.mock('./acts', () => ({
  ...jest.requireActual('./acts'),
  loadArtistIndex: jest.fn(async () => new Map()),
}));
jest.mock('./http', () => ({ fetchJson: jest.fn() }));

import { fetchJson } from './http';
import { QuicketAdapter } from './quicket';
import { TicketmasterAdapter } from './ticketmaster';

const fetchMock = fetchJson as jest.MockedFunction<typeof fetchJson>;

const window: FetchWindow = {
  tier: 'cold',
  from: new Date('2026-11-14T00:00:00Z'),
  to: new Date('2027-11-15T00:00:00Z'),
  markets: ['ZA'],
};

async function drain(iterable: AsyncIterable<unknown>): Promise<void> {
  for await (const item of iterable) void item;
}

beforeEach(() => fetchMock.mockReset());

describe('Quicket sweep completeness', () => {
  it('reports a whole catalogue when every page loads', async () => {
    fetchMock
      .mockResolvedValueOnce({ results: [], pages: 2 })
      .mockResolvedValueOnce({ results: [], pages: 2 });
    const sweep: SweepReport = {};
    await drain(new QuicketAdapter().fetchEvents(window, sweep));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sweep.incomplete).toBeUndefined();
  });

  it('marks the pass incomplete when a page fails', async () => {
    fetchMock
      .mockResolvedValueOnce({ results: [], pages: 3 })
      .mockRejectedValueOnce(new Error('quicket responded 503'));
    const sweep: SweepReport = {};
    await drain(new QuicketAdapter().fetchEvents(window, sweep));
    expect(sweep.incomplete).toMatch(/page 2 failed: quicket responded 503/);
  });
});

describe('Ticketmaster sweep completeness', () => {
  it('marks the pass incomplete when a page fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ticketmaster responded 500'));
    const sweep: SweepReport = {};
    await drain(new TicketmasterAdapter().fetchEvents(window, sweep));
    expect(sweep.incomplete).toMatch(/ZA page 0 failed/);
  });

  it('marks the pass incomplete when the paging cap cuts a market short', async () => {
    const fullPage = { _embedded: { events: Array.from({ length: 100 }, () => ({})) } };
    fetchMock.mockResolvedValue({ ...fullPage, page: { totalPages: 50 } });
    const sweep: SweepReport = {};
    await drain(new TicketmasterAdapter().fetchEvents(window, sweep));
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(sweep.incomplete).toMatch(/more than 20 pages/);
  });

  it('reports a whole catalogue when the last page is reached', async () => {
    fetchMock.mockResolvedValueOnce({ _embedded: { events: [] }, page: { totalPages: 1 } });
    const sweep: SweepReport = {};
    await drain(new TicketmasterAdapter().fetchEvents(window, sweep));
    expect(sweep.incomplete).toBeUndefined();
  });
});

/**
 * Apple token revocation inside the deletion job: it runs before the data is
 * removed, and a failure never stops the deletion.
 */

const appleCredentials = {
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  privateKey: 'unused: revocation is mocked',
  clientId: 'za.co.onstage',
};

const mockConfig: {
  accountDeletion: { graceDays: number };
  firebase: undefined;
  apple: typeof appleCredentials | undefined;
} = { accountDeletion: { graceDays: 7 }, firebase: undefined, apple: appleCredentials };

const tx = {
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
  follow: { findMany: jest.fn() },
  rating: { findMany: jest.fn() },
  attendance: { findMany: jest.fn() },
  commentLike: { findMany: jest.fn() },
  comment: { findMany: jest.fn(), updateMany: jest.fn() },
  user: { delete: jest.fn(), upsert: jest.fn() },
};

const mockPrisma = {
  user: { findMany: jest.fn() },
  $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
};

const mockRevoke = jest.fn();
const mockSentry = { captureException: jest.fn(), captureMessage: jest.fn() };

jest.mock('../config', () => ({ config: mockConfig }));
jest.mock('../prisma', () => ({ prisma: mockPrisma }));
jest.mock('../logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../apple', () => ({ revokeAppleRefreshToken: (...args: unknown[]) => mockRevoke(...args) }));
jest.mock('@sentry/node', () => mockSentry);

import { executeAccountDeletions } from './account-deletion';

const USER_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.apple = appleCredentials;
  mockPrisma.user.findMany.mockResolvedValue([
    { id: USER_ID, authUid: null, appleCredential: { refreshToken: 'r-token' } },
  ]);
  tx.$queryRaw.mockResolvedValue([{ id: USER_ID }]);
  for (const model of [tx.follow, tx.rating, tx.attendance, tx.commentLike, tx.comment]) {
    model.findMany.mockResolvedValue([]);
  }
  tx.user.delete.mockResolvedValue({});
});

describe('executeAccountDeletions — Sign in with Apple', () => {
  it('revokes the stored refresh token before deleting the user', async () => {
    mockRevoke.mockResolvedValue(undefined);

    await expect(executeAccountDeletions()).resolves.toEqual({ deleted: 1, failed: 0 });

    expect(mockRevoke).toHaveBeenCalledWith(appleCredentials, 'r-token');
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
    expect(mockRevoke.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.delete.mock.invocationCallOrder[0],
    );
    expect(mockSentry.captureException).not.toHaveBeenCalled();
  });

  it('still deletes the account when revocation fails, and reports it', async () => {
    const failure = new Error('Apple token revocation failed (400 invalid_client)');
    mockRevoke.mockRejectedValue(failure);

    await expect(executeAccountDeletions()).resolves.toEqual({ deleted: 1, failed: 0 });

    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
    expect(mockSentry.captureException).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ tags: expect.objectContaining({ step: 'apple-revoke' }) }),
    );
  });

  it('deletes without revoking when Apple is not configured, warning once', async () => {
    mockConfig.apple = undefined;
    mockPrisma.user.findMany.mockResolvedValue([
      { id: USER_ID, authUid: null, appleCredential: { refreshToken: 'r-1' } },
      { id: '22222222-2222-2222-2222-222222222222', authUid: null, appleCredential: { refreshToken: 'r-2' } },
    ]);
    tx.$queryRaw.mockImplementation(() => Promise.resolve([{ id: 'x' }]));

    await expect(executeAccountDeletions()).resolves.toEqual({ deleted: 2, failed: 0 });

    expect(mockRevoke).not.toHaveBeenCalled();
    expect(mockSentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it('does not call Apple for users who never signed in with Apple', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: USER_ID, authUid: null, appleCredential: null }]);

    await expect(executeAccountDeletions()).resolves.toEqual({ deleted: 1, failed: 0 });
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});

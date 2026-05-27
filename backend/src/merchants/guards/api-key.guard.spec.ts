import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

const mockMerchantsService = {
  findByApiKey: jest.fn(),
};

function makeContext(apiKey?: string) {
  const request = { headers: apiKey ? { 'x-api-key': apiKey } : {}, merchant: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    _request: request,
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;

  beforeEach(() => {
    guard = new ApiKeyGuard(mockMerchantsService as any);
    jest.clearAllMocks();
  });

  it('throws UnauthorizedException when no api key header', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when key is invalid', async () => {
    mockMerchantsService.findByApiKey.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext('bad-key'))).rejects.toThrow(UnauthorizedException);
  });

  it('returns true and attaches merchant when key is valid', async () => {
    const merchant = { id: 'merchant-uuid', apiKey: 'valid-key', isActive: true };
    mockMerchantsService.findByApiKey.mockResolvedValue(merchant);
    const ctx = makeContext('valid-key');
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect((ctx as any)._request.merchant).toEqual(merchant);
  });
});

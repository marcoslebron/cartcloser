import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';

const mockUser = {
  id: 'user-uuid',
  email: 'test@store.com',
  passwordHash: '$2b$10$hashedpassword',
  merchantId: 'merchant-uuid',
  role: 'owner',
};

const mockRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(mockUser),
  })),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('findByEmail', () => {
    it('returns user with passwordHash selected', async () => {
      const result = await service.findByEmail('test@store.com');
      expect(result?.email).toBe('test@store.com');
      expect(result?.passwordHash).toBeDefined();
    });
  });

  describe('findById', () => {
    it('returns user by id', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);
      const result = await service.findById('user-uuid');
      expect(result?.id).toBe('user-uuid');
    });

    it('returns null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.findById('bad-id');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('hashes password before saving', async () => {
      const saved = { ...mockUser };
      mockRepo.create.mockReturnValue(saved);
      mockRepo.save.mockResolvedValue(saved);

      const result = await service.create({ email: 'test@store.com', password: 'plaintext' }, 'merchant-uuid');

      const createCall = mockRepo.create.mock.calls[0][0];
      expect(createCall.passwordHash).not.toBe('plaintext');
      expect(createCall.passwordHash).toMatch(/^\$2b\$/);
      expect(result.merchantId).toBe('merchant-uuid');
    });
  });
});

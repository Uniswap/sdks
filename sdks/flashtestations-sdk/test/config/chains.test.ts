import {
  CHAIN_CONFIGS,
  getContractAddress,
  getRpcUrl,
  getBlockExplorerUrl,
  getChainConfig,
  getSupportedChains,
  isChainSupported,
  getChainBySlug,
  getSupportedChainSlugs,
  isValidChainSlug,
  getDefaultChainSlug,
} from '../../src/config/chains';

describe('Chain Configuration', () => {
  describe('CHAIN_CONFIGS', () => {
    it('should contain Unichain Mainnet configuration', () => {
      const config = CHAIN_CONFIGS[130];
      expect(config).toBeDefined();
      expect(config.chainId).toBe(130);
      expect(config.name).toBe('Unichain Mainnet');
      expect(config.slug).toBe('unichain-mainnet');
      expect(config.contractAddress).toBeDefined();
      expect(config.defaultRpcUrl).toBe('https://mainnet.unichain.org');
      expect(config.blockExplorerUrl).toBe('https://uniscan.xyz');
    });

    it('should contain Unichain Sepolia configuration', () => {
      const config = CHAIN_CONFIGS[1301];
      expect(config).toBeDefined();
      expect(config.chainId).toBe(1301);
      expect(config.name).toBe('Unichain Sepolia');
      expect(config.slug).toBe('unichain-sepolia');
      expect(config.contractAddress).toBeDefined();
      expect(config.defaultRpcUrl).toBe('https://sepolia.unichain.org');
      expect(config.blockExplorerUrl).toBe('https://sepolia.uniscan.xyz');
    });

    it('should have unique slugs for all chains', () => {
      const slugs = Object.values(CHAIN_CONFIGS).map(config => config.slug);
      const uniqueSlugs = new Set(slugs);
      expect(slugs.length).toBe(uniqueSlugs.size);
    });
  });

  describe('getContractAddress', () => {
    it('should return contract address for supported chain', () => {
      const address = getContractAddress(130);
      expect(address).toBe(CHAIN_CONFIGS[130].contractAddress);
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(0);
    });

    it('should return contract address for Unichain Sepolia', () => {
      const address = getContractAddress(1301);
      expect(address).toBe(CHAIN_CONFIGS[1301].contractAddress);
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(0);
    });

    it('should throw ChainNotSupportedError for unsupported chain', () => {
      expect(() => getContractAddress(9999)).toThrow('Chain 9999 not supported');
      expect(() => getContractAddress(1)).toThrow('Chain 1 not supported');

      try {
        getContractAddress(9999);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.name).toBe('ChainNotSupportedError');
        expect(error.chainId).toBe(9999);
      }
    });
  });

  describe('getRpcUrl', () => {
    it('should return RPC URL for Unichain Mainnet', () => {
      const rpcUrl = getRpcUrl(130);
      expect(rpcUrl).toBe('https://mainnet.unichain.org');
    });

    it('should return RPC URL for Unichain Sepolia', () => {
      const rpcUrl = getRpcUrl(1301);
      expect(rpcUrl).toBe('https://sepolia.unichain.org');
    });

    it('should throw ChainNotSupportedError for unsupported chain', () => {
      expect(() => getRpcUrl(9999)).toThrow('Chain 9999 not supported');
      expect(() => getRpcUrl(42)).toThrow('Chain 42 not supported');
    });
  });

  describe('getBlockExplorerUrl', () => {
    it('should return block explorer URL for Unichain Mainnet', () => {
      const explorerUrl = getBlockExplorerUrl(130);
      expect(explorerUrl).toBe('https://uniscan.xyz');
    });

    it('should return block explorer URL for Unichain Sepolia', () => {
      const explorerUrl = getBlockExplorerUrl(1301);
      expect(explorerUrl).toBe('https://sepolia.uniscan.xyz');
    });

    it('should throw ChainNotSupportedError for unsupported chain', () => {
      expect(() => getBlockExplorerUrl(9999)).toThrow('Chain 9999 not supported');
    });
  });

  describe('getChainConfig', () => {
    it('should return complete chain config for supported chain', () => {
      const config = getChainConfig(130);
      expect(config).toEqual(CHAIN_CONFIGS[130]);
      expect(config.chainId).toBe(130);
      expect(config.name).toBe('Unichain Mainnet');
      expect(config.contractAddress).toBeDefined();
      expect(config.defaultRpcUrl).toBeDefined();
      expect(config.blockExplorerUrl).toBeDefined();
    });

    it('should return complete chain config for Unichain Sepolia', () => {
      const config = getChainConfig(1301);
      expect(config).toEqual(CHAIN_CONFIGS[1301]);
      expect(config.chainId).toBe(1301);
    });

    it('should throw ChainNotSupportedError for unsupported chain', () => {
      expect(() => getChainConfig(9999)).toThrow('Chain 9999 not supported');
    });
  });

  describe('getSupportedChains', () => {
    it('should return array of supported chain IDs', () => {
      const supportedChains = getSupportedChains();
      expect(Array.isArray(supportedChains)).toBe(true);
      expect(supportedChains).toContain(130);
      expect(supportedChains).toContain(1301);
    });

    it('should return chain IDs as numbers', () => {
      const supportedChains = getSupportedChains();
      supportedChains.forEach(chainId => {
        expect(typeof chainId).toBe('number');
      });
    });
  });

  describe('isChainSupported', () => {
    it('should return true for supported chains', () => {
      expect(isChainSupported(130)).toBe(true);
      expect(isChainSupported(1301)).toBe(true);
    });

    it('should return false for unsupported chains', () => {
      expect(isChainSupported(1)).toBe(false);
      expect(isChainSupported(9999)).toBe(false);
      expect(isChainSupported(42)).toBe(false);
      expect(isChainSupported(0)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isChainSupported(-1)).toBe(false);
      expect(isChainSupported(NaN)).toBe(false);
      expect(isChainSupported(Infinity)).toBe(false);
    });
  });

  describe('error handling integration', () => {
    it('should provide consistent error information across functions', () => {
      const unsupportedChainId = 9999;

      const testError = (fn: () => any) => {
        try {
          fn();
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.name).toBe('ChainNotSupportedError');
          expect(error.chainId).toBe(unsupportedChainId);
          expect(error.message).toContain(`Chain ${unsupportedChainId} not supported`);
          expect(error.message).toContain('130, 1301');
        }
      };

      testError(() => getContractAddress(unsupportedChainId));
      testError(() => getRpcUrl(unsupportedChainId));
      testError(() => getBlockExplorerUrl(unsupportedChainId));
      testError(() => getChainConfig(unsupportedChainId));
    });
  });

  describe('getChainBySlug', () => {
    it('should return chain config for valid slug', () => {
      const config = getChainBySlug('unichain-mainnet');
      expect(config).toBeDefined();
      expect(config?.chainId).toBe(130);
      expect(config?.name).toBe('Unichain Mainnet');
    });

    it('should return chain config for unichain-sepolia', () => {
      const config = getChainBySlug('unichain-sepolia');
      expect(config).toBeDefined();
      expect(config?.chainId).toBe(1301);
      expect(config?.name).toBe('Unichain Sepolia');
    });

    it('should return undefined for invalid slug', () => {
      expect(getChainBySlug('invalid-chain')).toBeUndefined();
      expect(getChainBySlug('')).toBeUndefined();
      expect(getChainBySlug('ethereum-mainnet')).toBeUndefined();
    });
  });

  describe('getSupportedChainSlugs', () => {
    it('should return array of chain slugs', () => {
      const slugs = getSupportedChainSlugs();
      expect(Array.isArray(slugs)).toBe(true);
      expect(slugs).toContain('unichain-mainnet');
      expect(slugs).toContain('unichain-sepolia');
      expect(slugs).toContain('unichain-alphanet');
      expect(slugs).toContain('unichain-experimental');
    });

    it('should return slugs as strings', () => {
      const slugs = getSupportedChainSlugs();
      slugs.forEach(slug => {
        expect(typeof slug).toBe('string');
        expect(slug.length).toBeGreaterThan(0);
      });
    });
  });

  describe('isValidChainSlug', () => {
    it('should return true for valid slugs', () => {
      expect(isValidChainSlug('unichain-mainnet')).toBe(true);
      expect(isValidChainSlug('unichain-sepolia')).toBe(true);
      expect(isValidChainSlug('unichain-alphanet')).toBe(true);
      expect(isValidChainSlug('unichain-experimental')).toBe(true);
    });

    it('should return false for invalid slugs', () => {
      expect(isValidChainSlug('invalid')).toBe(false);
      expect(isValidChainSlug('')).toBe(false);
      expect(isValidChainSlug('ethereum')).toBe(false);
      expect(isValidChainSlug('UNICHAIN-MAINNET')).toBe(false); // case sensitive
    });
  });

  describe('getDefaultChainSlug', () => {
    it('should return unichain-mainnet as default', () => {
      expect(getDefaultChainSlug()).toBe('unichain-mainnet');
    });

    it('should return a valid chain slug', () => {
      const defaultSlug = getDefaultChainSlug();
      expect(isValidChainSlug(defaultSlug)).toBe(true);
    });
  });
});

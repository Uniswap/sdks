import {
  CHAIN_CONFIGS,
  getContractAddress,
  getRpcUrl,
  getBlockExplorerUrl,
  getChainConfig,
  getSupportedChains,
  isChainSupported,
} from '../../src/config/chains';

describe('Chain Configuration', () => {
  describe('CHAIN_CONFIGS', () => {
    it('should contain Unichain Mainnet configuration', () => {
      const config = CHAIN_CONFIGS[130];
      expect(config).toBeDefined();
      expect(config.chainId).toBe(130);
      expect(config.name).toBe('Unichain Mainnet');
      expect(config.contractAddress).toBeDefined();
      expect(config.defaultRpcUrl).toBe('https://mainnet.unichain.org');
      expect(config.blockExplorerUrl).toBe('https://uniscan.xyz');
    });

    it('should contain Unichain Sepolia configuration', () => {
      const config = CHAIN_CONFIGS[1301];
      expect(config).toBeDefined();
      expect(config.chainId).toBe(1301);
      expect(config.name).toBe('Unichain Sepolia');
      expect(config.contractAddress).toBeDefined();
      expect(config.defaultRpcUrl).toBe('https://sepolia.unichain.org');
      expect(config.blockExplorerUrl).toBe('https://sepolia.uniscan.xyz');
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
});

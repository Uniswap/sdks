import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PermissionedTokenValidator } from '../../src/utils/PermissionedTokenValidator';
import { PERMISSIONED_TOKENS } from '../../src/constants';
import { ChainId } from '@uniswap/sdk-core';

// FORK_URL should be set to a mainnet RPC URL in the .env file
// FORK_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID

describe('PermissionedTokenValidator Live Tests', () => {
  // Test parameters provided by user
  const TOKEN_ADDRESS = '0x7712c34205737192402172409a8F7ccef8aA2AEc'; // BUIDL token
  const FROM_ADDRESS = '0x1e695A689CF29c8fE0AF6848A957e3f84B61Fe69';
  const TO_ADDRESS = '0x1e695A689CF29c8fE0AF6848A957e3f84B61Fe69';
  const VALUE = '101000000';
  const CHAIN_ID = ChainId.MAINNET;

  describe('preTransferCheck with real BUIDL token', () => {
    it('should perform preTransferCheck on live BUIDL token with exact user parameters', async () => {
      // Use the real provider from hardhat config
      const provider = ethers.provider;
      
      // Verify we're on the correct network
      const network = await provider.getNetwork();
      console.log(`Testing on network: ${network.name} (chainId: ${network.chainId})`);
      
      // Verify the token is in our permissioned tokens list
      const tokenConfig = PERMISSIONED_TOKENS.find(
        token => token.address.toLowerCase() === TOKEN_ADDRESS.toLowerCase() && token.chainId === CHAIN_ID
      );
      
      expect(tokenConfig).to.not.be.undefined;
      expect(tokenConfig?.symbol).to.equal('BUIDL');
      expect(tokenConfig?.interface).to.equal('DSTokenInterface');
      expect(tokenConfig?.proxyType).to.equal('None');

      console.log(`Testing preTransferCheck for BUIDL token:`);
      console.log(`  Token: ${TOKEN_ADDRESS}`);
      console.log(`  From: ${FROM_ADDRESS}`);
      console.log(`  To: ${TO_ADDRESS}`);
      console.log(`  Value: ${VALUE}`);
      console.log(`  ChainId: ${CHAIN_ID}`);

      // Perform the preTransferCheck
      const result = await PermissionedTokenValidator.preTransferCheck(
        provider,
        TOKEN_ADDRESS,
        FROM_ADDRESS,
        TO_ADDRESS,
        VALUE,
        PERMISSIONED_TOKENS
      );

      console.log(`preTransferCheck result: ${result}`);
      
      // The result should be a boolean indicating whether the transfer is allowed
      expect(typeof result).to.equal('boolean');
      
      // Log the result for debugging
      if (result) {
        console.log('✅ Transfer is allowed');
      } else {
        console.log('❌ Transfer is not allowed');
      }
    });
  });
});

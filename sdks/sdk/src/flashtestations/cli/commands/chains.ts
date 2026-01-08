/**
 * CLI command: chains - List supported chains
 */

import { Command } from 'commander';

import { CHAIN_CONFIGS } from '../../config/chains';
import { DEFAULT_CHAIN_ID } from '../utils/chainFlags';
import { outputJson, printInfo } from '../utils/output';

interface ChainsOptions {
  json?: boolean;
}

export function createChainsCommand(): Command {
  const command = new Command('chains')
    .description('List all supported chains and their configuration')
    .option('--json', 'Output as JSON')
    .action(async (options: ChainsOptions) => {
      if (options.json) {
        outputChainsJson();
      } else {
        outputChainsHuman();
      }
    });

  return command;
}

function outputChainsHuman(): void {
  printInfo('Supported Chains:\n');

  for (const config of Object.values(CHAIN_CONFIGS)) {
    const isDefault = config.chainId === DEFAULT_CHAIN_ID;
    const defaultLabel = isDefault ? ' [default]' : '';

    printInfo(`  ${config.name} (${config.chainId})${defaultLabel}`);
    printInfo(`    RPC:                         ${config.defaultRpcUrl || 'must be provided'}`);
    printInfo(`    Explorer:                    ${config.blockExplorerUrl || 'none'}`);
    printInfo(`    BlockBuilderPolicy Contract: ${config.contractAddress}`);
    printInfo('');
  }
}

function outputChainsJson(): void {
  const chains = Object.values(CHAIN_CONFIGS).map((config) => ({
    chainId: config.chainId,
    name: config.name,
    isDefault: config.chainId === DEFAULT_CHAIN_ID,
    rpcUrl: config.defaultRpcUrl || null,
    blockExplorerUrl: config.blockExplorerUrl || null,
    contractAddress: config.contractAddress,
  }));

  outputJson({ success: true, chains });
}

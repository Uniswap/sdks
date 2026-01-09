/**
 * CLI command: verify - Verify block builder TEE workload
 */

import { readFileSync } from 'fs'

import { Command } from 'commander'

import { WorkloadMeasurementRegisters, VerificationResult } from '../../types'
import { verifyFlashtestationInBlock } from '../../verification/service'
import { addChainFlags, resolveChainConfig, getChainDisplayName, ChainOptions } from '../utils/chainFlags'
import {
  handleError,
  outputJson,
  printInfo,
  printSuccess,
  printFailure,
  printLabeledValue,
  printSection,
} from '../utils/output'

interface VerifyOptions extends ChainOptions {
  workloadId?: string
  measurements?: string
  block?: string
  json?: boolean
}

export function createVerifyCommand(): Command {
  let command = new Command('verify')
    .description('Verify if a block was built by an expected TEE workload')
    .option('-w, --workload-id <id>', 'Expected workload ID (hex string)')
    .option('-m, --measurements <path>', 'Path to JSON file with measurement registers')
    .option(
      '-b, --block <param>',
      'Block parameter: latest, earliest, finalized, safe, pending, block number, or block hash',
      'latest'
    )
    .option('--json', 'Output as JSON')

  command = addChainFlags(command)

  command.action(async (options: VerifyOptions) => {
    try {
      // Validate mutually exclusive options
      if (!options.workloadId && !options.measurements) {
        throw new Error('Either --workload-id or --measurements is required')
      }
      if (options.workloadId && options.measurements) {
        throw new Error('--workload-id and --measurements are mutually exclusive')
      }

      await runVerify(options)
    } catch (error) {
      handleError(error, options.json ?? false)
      // Exit code 1 for general errors
      process.exit(1)
    }
  })

  return command
}

async function runVerify(options: VerifyOptions): Promise<void> {
  const chainConfig = resolveChainConfig(options)
  const blockParam = options.block ?? 'latest'
  const chainName = getChainDisplayName(chainConfig.chainId)

  // Determine workload ID or measurements
  let workloadIdOrRegisters: string | WorkloadMeasurementRegisters

  if (options.workloadId) {
    workloadIdOrRegisters = options.workloadId
  } else {
    // Read measurements file
    const fileContent = readFileSync(options.measurements!, 'utf-8')
    try {
      workloadIdOrRegisters = JSON.parse(fileContent) as WorkloadMeasurementRegisters
    } catch {
      throw new Error(`Invalid JSON in measurements file: ${options.measurements}`)
    }
  }

  if (!options.json) {
    printInfo(`Verifying block '${blockParam}' on ${chainName} (${chainConfig.chainId})...`)
  }

  // Perform verification
  const result = await verifyFlashtestationInBlock(workloadIdOrRegisters, blockParam, {
    chainId: chainConfig.chainId,
    rpcUrl: chainConfig.rpcUrl,
  })

  if (options.json) {
    outputVerifyJson(result, chainConfig.chainId, blockParam)
  } else {
    outputVerifyHuman(result)
  }

  // Exit code 2 for verification failure (block NOT built by expected TEE)
  if (!result.isBuiltByExpectedTee) {
    process.exit(2)
  }
}

function outputVerifyHuman(result: VerificationResult): void {
  if (result.isBuiltByExpectedTee) {
    printSuccess('Block was built by expected TEE workload!')
  } else if (result.workloadMetadata) {
    printFailure('Block was built by a DIFFERENT TEE workload.')
  } else {
    printFailure('Block was NOT built by a TEE workload.')
    return
  }

  // Show workload details if available
  if (result.workloadMetadata) {
    printSection('Workload Details')
    printLabeledValue('Workload ID:', result.workloadMetadata.workloadId)
    printLabeledValue('Builder:', result.workloadMetadata.builderAddress)
    printLabeledValue('Commit Hash:', result.workloadMetadata.commitHash)
    printLabeledValue('Version:', String(result.workloadMetadata.version))

    if (result.blockExplorerLink) {
      printLabeledValue('Block Explorer:', result.blockExplorerLink)
    }

    if (result.workloadMetadata.sourceLocators.length > 0) {
      printSection('Source Locators')
      result.workloadMetadata.sourceLocators.forEach((locator) => {
        printInfo(`  - ${locator}`)
      })
    }
  }
}

function outputVerifyJson(result: VerificationResult, chainId: number, blockParam: string): void {
  outputJson({
    success: true,
    isBuiltByExpectedTee: result.isBuiltByExpectedTee,
    chainId,
    blockParameter: blockParam,
    workloadMetadata: result.workloadMetadata
      ? {
          workloadId: result.workloadMetadata.workloadId,
          builderAddress: result.workloadMetadata.builderAddress,
          commitHash: result.workloadMetadata.commitHash,
          version: result.workloadMetadata.version,
          sourceLocators: result.workloadMetadata.sourceLocators,
        }
      : null,
    blockExplorerLink: result.blockExplorerLink,
  })
}

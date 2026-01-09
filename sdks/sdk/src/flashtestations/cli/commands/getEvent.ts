/**
 * CLI command: get-event - Get flashtestation event from a block
 */

import { Command } from 'commander'

import { FlashtestationEvent } from '../../types'
import { getFlashtestationEvent } from '../../verification/service'
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

interface GetEventOptions extends ChainOptions {
  block?: string
  json?: boolean
}

export function createGetEventCommand(): Command {
  let command = new Command('get-event')
    .description('Retrieve flashtestation event data from a block (no verification)')
    .option(
      '-b, --block <param>',
      'Block parameter: latest, earliest, finalized, safe, pending, block number, or block hash',
      'latest'
    )
    .option('--json', 'Output as JSON')

  command = addChainFlags(command)

  command.action(async (options: GetEventOptions) => {
    try {
      await runGetEvent(options)
    } catch (error) {
      handleError(error, options.json ?? false)
      process.exit(1)
    }
  })

  return command
}

async function runGetEvent(options: GetEventOptions): Promise<void> {
  const chainConfig = resolveChainConfig(options)
  const blockParam = options.block ?? 'latest'
  const chainName = getChainDisplayName(chainConfig.chainId)

  if (!options.json) {
    printInfo(`Fetching flashtestation event from block '${blockParam}' on ${chainName} (${chainConfig.chainId})...`)
  }

  // Fetch the flashtestation event
  const event = await getFlashtestationEvent(blockParam, {
    chainId: chainConfig.chainId,
    rpcUrl: chainConfig.rpcUrl,
  })

  if (options.json) {
    outputGetEventJson(event, chainConfig.chainId, blockParam)
  } else {
    outputGetEventHuman(event)
  }
}

function outputGetEventHuman(event: FlashtestationEvent | null): void {
  if (!event) {
    printFailure('No flashtestation transaction found in this block.')
    return
  }

  printSuccess('This is a flashtestation transaction!')

  printSection('Transaction Details')
  printLabeledValue('Caller:', event.caller)
  printLabeledValue('Workload ID:', event.workloadId)
  printLabeledValue('Version:', String(event.version))
  printLabeledValue('Block Content Hash:', event.blockContentHash)
  printLabeledValue('Commit Hash:', event.commitHash)
  printLabeledValue('Source Locators:', event.sourceLocators.length > 0 ? event.sourceLocators.join(', ') : 'None')
}

function outputGetEventJson(event: FlashtestationEvent | null, chainId: number, blockParam: string): void {
  if (!event) {
    outputJson({
      success: true,
      found: false,
      chainId,
      blockParameter: blockParam,
      event: null,
    })
    return
  }

  outputJson({
    success: true,
    found: true,
    chainId,
    blockParameter: blockParam,
    event: {
      caller: event.caller,
      workloadId: event.workloadId,
      version: event.version,
      blockContentHash: event.blockContentHash,
      commitHash: event.commitHash,
      sourceLocators: event.sourceLocators,
    },
  })
}

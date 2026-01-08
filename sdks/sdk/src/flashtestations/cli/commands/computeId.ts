/**
 * CLI command: compute-workload-id - Compute workload ID from measurements
 */

import { readFileSync } from 'fs';

import { Command } from 'commander';

import { computeAllWorkloadIds } from '../../crypto/workload';
import { WorkloadMeasurementRegisters } from '../../types';
import { handleError, outputJson, printInfo, printSection } from '../utils/output';

interface ComputeIdOptions {
  measurements: string;
  json?: boolean;
}

export function createComputeIdCommand(): Command {
  const command = new Command('compute-workload-id')
    .description('Compute workload ID(s) from measurement registers')
    .requiredOption('-m, --measurements <path>', 'Path to JSON file with measurement registers')
    .option('--json', 'Output as JSON')
    .action(async (options: ComputeIdOptions) => {
      try {
        await runComputeId(options);
      } catch (error) {
        handleError(error, options.json ?? false);
        process.exit(1);
      }
    });

  return command;
}

async function runComputeId(options: ComputeIdOptions): Promise<void> {
  // Read and parse measurements file
  const fileContent = readFileSync(options.measurements, 'utf-8');
  let measurements: WorkloadMeasurementRegisters;

  try {
    measurements = JSON.parse(fileContent) as WorkloadMeasurementRegisters;
  } catch {
    throw new Error(`Invalid JSON in measurements file: ${options.measurements}`);
  }

  // Compute all possible workload IDs
  const workloadIds = computeAllWorkloadIds(measurements);

  if (options.json) {
    outputComputeIdJson(workloadIds);
  } else {
    outputComputeIdHuman(workloadIds);
  }
}

function outputComputeIdHuman(workloadIds: string[]): void {
  printInfo('Computing workload ID(s) from measurements...');

  if (workloadIds.length === 1) {
    printSection('Workload ID');
    printInfo(`\n  ${workloadIds[0]}`);
  } else {
    printInfo(`\nFound ${workloadIds.length} workload ID(s) (due to array values in registers):\n`);
    workloadIds.forEach((id, index) => {
      printInfo(`  ${index + 1}. ${id}`);
    });
  }
}

function outputComputeIdJson(workloadIds: string[]): void {
  outputJson({
    success: true,
    workloadIds,
    count: workloadIds.length,
  });
}

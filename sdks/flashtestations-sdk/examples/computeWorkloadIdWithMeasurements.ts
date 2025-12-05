import { readFileSync } from 'fs';

import { expandToSingularRegisters, computeWorkloadId } from '../src/index';
import type { WorkloadMeasurementRegisters } from '../src/types/index';

/**
 * Example: Compute workload IDs from measurement registers in a JSON file
 *
 * This example demonstrates how to:
 * 1. Read measurement registers from a JSON file
 * 2. Expand registers with array values into all singular combinations
 * 3. Compute workload IDs for each combination
 * 4. Display all possible workload IDs
 *
 * Usage:
 *   npx tsx examples/computeWorkloadIdWithMeasurements.ts <path-to-measurements.json>
 *
 * Example measurements.json format:
{
  "rtmr1": "b3c55292121692a6f6a4308318911d860ae569003f31b7f4b689e374b73bbfb885696431b6561a3a5f2fbadd18e1b01f",
  "rtmr2": "7a18b73626a93ddeed1c81a1ccf74eed16373c2f663466774a3c6c3769b3060af98aa4b56315fe01743236594c0d6030",
  "rtmr0": [
    "a4a4ea094f2ffc93f5709e8c1eab44ad59ed0c4f865100d3f8ae90ed2ec8b4afcafe683796439c8672b56556396916cd",
    "8b2f6a32075935075ff22e0667206e15449b1b32d1c8ea8fa39378ef1d196bb064ce38b4f8cf516caccef60dfa7e2fee"
  ],
  "rtmr3": "0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  "mrtd": [
    "a5844e88897b70c318bef929ef4dfd6c7304c52c4bc9c3f39132f0fdccecf3eb5bab70110ee42a12509a31c037288694"
  ],
  "tdattributes": "0x0000001000000000",
  "xfam": "0xe702060000000000",
  "mrconfigid": "0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
}
 */
async function main() {
    try {
        // Get file path from command line arguments
        const filePath = process.argv[2];

        if (!filePath) {
            console.error('Error: File path is required');
            console.error('\nUsage:');
            console.error('  npx tsx examples/computeWorkloadIdWithMeasurements.ts <path-to-measurements.json>');
            console.error('\nExample:');
            console.error('  npx tsx examples/computeWorkloadIdWithMeasurements.ts ./measurements.json');
            process.exit(1);
        }

        console.log(`Reading measurement registers from: ${filePath}\n`);

        // Read and parse the JSON file
        let registers: WorkloadMeasurementRegisters;
        try {
            const fileContent = readFileSync(filePath, 'utf-8');
            registers = JSON.parse(fileContent);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                console.error(`Error: File not found: ${filePath}`);
            } else if (error instanceof SyntaxError) {
                console.error(`Error: Invalid JSON in file: ${filePath}`);
                console.error(`Details: ${error.message}`);
            } else {
                console.error(`Error reading file: ${error}`);
            }
            process.exit(1);
        }

        // Expand to all singular register combinations
        const singularRegisters = expandToSingularRegisters(registers);

        console.log('Measurement Registers:');
        console.log('=====================');
        console.log(`mrtd values: ${Array.isArray(registers.mrtd) ? registers.mrtd.length : 1}`);
        console.log(`rtmr0 values: ${Array.isArray(registers.rtmr0) ? registers.rtmr0.length : 1}`);
        console.log(`Total combinations: ${singularRegisters.length}\n`);

        // Compute workload ID for each combination
        console.log('Computed Workload IDs:');
        console.log('======================');

        singularRegisters.forEach((singular, index) => {
            const workloadId = computeWorkloadId(singular);
            console.log(`\nCombination ${index + 1}:`);
            console.log(`  mrtd: ${singular.mrtd}`);
            console.log(`  rtmr0: ${singular.rtmr0}`);
            console.log(`  Workload ID: ${workloadId}`);
        });

        console.log('\nSuccessfully computed all workload IDs');

    } catch (error) {
        console.error('Error computing workload IDs:', error);
        process.exit(1);
    }
}

// Run the example
main();

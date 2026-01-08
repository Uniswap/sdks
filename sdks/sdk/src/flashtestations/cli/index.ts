#!/usr/bin/env node
/**
 * Flashtestations SDK CLI
 *
 * Verify TEE-built blocks on Unichain from the command line.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

import { Command } from 'commander';

import { createChainsCommand } from './commands/chains';
import { createComputeIdCommand } from './commands/computeId';
import { createGetEventCommand } from './commands/getEvent';
import { createVerifyCommand } from './commands/verify';

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('flashtestations')
  .description('Flashtestations SDK - Verify TEE-built blocks on Unichain')
  .version(packageJson.version, '-V, --version', 'Output the version number');

// Register commands
program.addCommand(createVerifyCommand());
program.addCommand(createGetEventCommand());
program.addCommand(createComputeIdCommand());
program.addCommand(createChainsCommand());

// Parse command line arguments
program.parse();

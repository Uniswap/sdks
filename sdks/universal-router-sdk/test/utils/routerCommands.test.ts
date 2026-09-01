import { expect } from 'chai'
import { defaultAbiCoder } from 'ethers/lib/utils'
import {
  CommandType,
  COMMAND_DEFINITION,
  PAYMENTS_COMMANDS_V2_3_0,
  V2V3_SWAP_COMMANDS_V2_1_1,
  createCommand,
  getCommandDefinition,
} from '../../src/utils/routerCommands'
import { CONTRACT_BALANCE, UniversalRouterVersion } from '../../src/utils/constants'

const RECIPIENT = '0x0000000000000000000000000000000000000001'

describe('routerCommands version layering', () => {
  describe('getCommandDefinition', () => {
    it('returns the base 2-param UNWRAP_WETH definition below V2_3_0', () => {
      expect(getCommandDefinition(CommandType.UNWRAP_WETH)).to.equal(COMMAND_DEFINITION[CommandType.UNWRAP_WETH])
      expect(getCommandDefinition(CommandType.UNWRAP_WETH, UniversalRouterVersion.V2_0)).to.equal(
        COMMAND_DEFINITION[CommandType.UNWRAP_WETH]
      )
      expect(getCommandDefinition(CommandType.UNWRAP_WETH, UniversalRouterVersion.V2_1_1)).to.equal(
        COMMAND_DEFINITION[CommandType.UNWRAP_WETH]
      )
      expect(getCommandDefinition(CommandType.UNWRAP_WETH, UniversalRouterVersion.V2_2_0)).to.equal(
        COMMAND_DEFINITION[CommandType.UNWRAP_WETH]
      )
    })

    it('returns the 3-param UNWRAP_WETH definition from V2_3_0', () => {
      const definition = getCommandDefinition(CommandType.UNWRAP_WETH, UniversalRouterVersion.V2_3_0)
      expect(definition).to.equal(PAYMENTS_COMMANDS_V2_3_0[CommandType.UNWRAP_WETH])
      expect((definition as any).params.map((param: any) => param.name)).to.deep.equal([
        'recipient',
        'amount',
        'minAmount',
      ])
    })

    it('keeps the V2_1_1 swap overrides active on V2_3_0', () => {
      expect(getCommandDefinition(CommandType.V3_SWAP_EXACT_IN, UniversalRouterVersion.V2_3_0)).to.equal(
        V2V3_SWAP_COMMANDS_V2_1_1[CommandType.V3_SWAP_EXACT_IN]
      )
    })

    it('leaves commands without overrides on the base definition on V2_3_0', () => {
      expect(getCommandDefinition(CommandType.WRAP_ETH, UniversalRouterVersion.V2_3_0)).to.equal(
        COMMAND_DEFINITION[CommandType.WRAP_ETH]
      )
      expect(getCommandDefinition(CommandType.SWEEP, UniversalRouterVersion.V2_3_0)).to.equal(
        COMMAND_DEFINITION[CommandType.SWEEP]
      )
    })
  })

  describe('createCommand', () => {
    it('encodes 2-param UNWRAP_WETH below V2_3_0', () => {
      const command = createCommand(CommandType.UNWRAP_WETH, [RECIPIENT, '100'], UniversalRouterVersion.V2_2_0)
      const decoded = defaultAbiCoder.decode(['address', 'uint256'], command.encodedInput)
      expect(decoded[0]).to.equal(RECIPIENT)
      expect(decoded[1].toString()).to.equal('100')
    })

    it('encodes 3-param UNWRAP_WETH on V2_3_0', () => {
      const command = createCommand(
        CommandType.UNWRAP_WETH,
        [RECIPIENT, CONTRACT_BALANCE, '100'],
        UniversalRouterVersion.V2_3_0
      )
      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256'], command.encodedInput)
      expect(decoded[0]).to.equal(RECIPIENT)
      expect(decoded[1].toString()).to.equal(CONTRACT_BALANCE.toString())
      expect(decoded[2].toString()).to.equal('100')
    })

    it('rejects legacy 2-param UNWRAP_WETH inputs when encoding for V2_3_0', () => {
      // catches un-migrated call sites at encode time via the ABI arity mismatch
      expect(() => createCommand(CommandType.UNWRAP_WETH, [RECIPIENT, '100'], UniversalRouterVersion.V2_3_0)).to.throw()
    })

    it('rejects 3-param UNWRAP_WETH inputs when encoding for older versions', () => {
      expect(() =>
        createCommand(CommandType.UNWRAP_WETH, [RECIPIENT, CONTRACT_BALANCE, '100'], UniversalRouterVersion.V2_2_0)
      ).to.throw()
    })
  })
})

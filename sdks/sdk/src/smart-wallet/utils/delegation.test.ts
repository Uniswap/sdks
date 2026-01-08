import { DELEGATION_MAGIC_PREFIX } from "../constants";

import { Delegation } from "./delegation";


describe('Delegation', () => {
    describe('parseFromCode', () => {
        const address = `1111111111111111111111111111111111111111`; // address length without 0x prefix
        it('parses out the delegation', () => {
          const delegation = Delegation.parseFromCode(`${DELEGATION_MAGIC_PREFIX}${address}`);
          expect(delegation).toBe(`0x${address}`)
        })
    
        it('throws an error if there is no delegation', () => {
          const emptyDelegation = '' as `0x${string}`;
          expect(() => Delegation.parseFromCode(emptyDelegation)).toThrow()
        })
    
        it('throws an error if the magic prefix is incorrect', () => {
          const incorrectMagicPrefix = '0x000000' as `0x${string}`;
          expect(() => Delegation.parseFromCode(`${incorrectMagicPrefix}${address}`)).toThrow(
            `Invalid delegation magic prefix: ${incorrectMagicPrefix}`
          )
        })
    })
})

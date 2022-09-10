import { ethers, BigNumber } from 'ethers';
import { buildNonce, setBit, getFirstUnsetBit } from './NonceManager';

describe('NonceManager', () => {
  describe('buildNonce', () => {
    it('0, 0', () => {
      expect(buildNonce(BigNumber.from(0), 0)).toEqual(BigNumber.from(0));
    });

    it('0, 1', () => {
      expect(buildNonce(BigNumber.from(0), 1)).toEqual(BigNumber.from(1));
    });

    it('0, 12', () => {
      expect(buildNonce(BigNumber.from(0), 12)).toEqual(BigNumber.from(12));
    });

    it('1, 0', () => {
      expect(buildNonce(BigNumber.from(1), 0)).toEqual(BigNumber.from(256));
    });

    it('1, 1', () => {
      expect(buildNonce(BigNumber.from(1), 1)).toEqual(BigNumber.from(257));
    });

    it('4, 1', () => {
      expect(buildNonce(BigNumber.from(4), 1)).toEqual(BigNumber.from(1025));
    });

    it('8, 1', () => {
      expect(buildNonce(BigNumber.from(8), 1)).toEqual(BigNumber.from(2049));
    });
  });

  describe('setBit', () => {
    it('0, 0', () => {
      expect(setBit(BigNumber.from(0), 0)).toEqual(BigNumber.from(1));
    });

    it('0, 1', () => {
      expect(setBit(BigNumber.from(0), 1)).toEqual(BigNumber.from(2));
    });

    it('0, 8', () => {
      expect(setBit(BigNumber.from(0), 8)).toEqual(BigNumber.from(256));
    });

    it('1, 0', () => {
      expect(setBit(BigNumber.from(1), 0)).toEqual(BigNumber.from(1));
    });

    it('1, 1', () => {
      expect(setBit(BigNumber.from(1), 1)).toEqual(BigNumber.from(3));
    });

    it('16756735, 12', () => {
      expect(setBit(BigNumber.from(16756735), 12)).toEqual(
        BigNumber.from(16760831)
      );
    });
  });

  describe('getFirstUnsetBit', () => {
    it('0', () => {
      expect(getFirstUnsetBit(BigNumber.from(0))).toEqual(0);
    });

    it('1', () => {
      expect(getFirstUnsetBit(BigNumber.from(1))).toEqual(1);
    });

    it('2', () => {
      expect(getFirstUnsetBit(BigNumber.from(2))).toEqual(0);
    });

    it('128', () => {
      expect(getFirstUnsetBit(BigNumber.from(128))).toEqual(0);
    });

    it('127', () => {
      expect(getFirstUnsetBit(BigNumber.from(127))).toEqual(7);
    });

    it('MaxUint256', () => {
      expect(getFirstUnsetBit(ethers.constants.MaxUint256)).toEqual(-1);
    });

    it('16756735', () => {
      expect(getFirstUnsetBit(BigNumber.from(16756735))).toEqual(12);
    });
  });
});

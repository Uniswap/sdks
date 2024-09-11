import { BigNumber } from "ethers";

import { NonLinearDutchDecayLib } from "./dutchBlockDecay";

describe("NonLinearDutchDecayLib", () => {
    it("Simple linearDecay", () => {
        const result = NonLinearDutchDecayLib.linearDecay(0, 10, 5, BigNumber.from(100), BigNumber.from(50));
        expect(result.toString()).toEqual('75');
    });

    it("Test for mulDivDown for endAmount < startAmount", () => {
        const result = NonLinearDutchDecayLib.linearDecay(0, 10, 5, BigNumber.from(100), BigNumber.from(75));
        expect(result.toString()).toEqual('88'); //If we successfully emulated mulDivDown then this is 88.
    });

    it("Simple linearDecay but with endAmount > startAmount", () => {
        const result = NonLinearDutchDecayLib.linearDecay(0, 10, 5, BigNumber.from(100), BigNumber.from(120));
        expect(result.toString()).toEqual('110');
    });

    it("Test for mulDivUp for endAmount > startAmount", () => {
        const result = NonLinearDutchDecayLib.linearDecay(0, 10, 5, BigNumber.from(100), BigNumber.from(125));
        //if we successfully emulated mulDivUp then this is 113
        expect(result.toString()).toEqual('113');
    });
});
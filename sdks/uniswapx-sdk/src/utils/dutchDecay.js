"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDecayedAmount = getDecayedAmount;
function getDecayedAmount(config, atTime = Math.floor(Date.now() / 1000)) {
    const { startAmount, endAmount, decayStartTime, decayEndTime } = config;
    // decay is over, return the ending amount
    if (decayEndTime <= atTime) {
        return endAmount;
    }
    // decay hasnt started, return the starting amount
    if (decayStartTime >= atTime) {
        return startAmount;
    }
    // no decay, just return the static amount
    if (startAmount.eq(endAmount)) {
        return startAmount;
    }
    const duration = decayEndTime - decayStartTime;
    const elapsed = atTime - decayStartTime;
    if (startAmount.gt(endAmount)) {
        // decaying downward
        const decay = startAmount.sub(endAmount).mul(elapsed).div(duration);
        return startAmount.sub(decay);
    }
    else {
        // decaying upward
        const decay = endAmount.sub(startAmount).mul(elapsed).div(duration);
        return startAmount.add(decay);
    }
}
//# sourceMappingURL=dutchDecay.js.map
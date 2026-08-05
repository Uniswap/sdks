import { createPublicClient, http, parseEther } from "viem";
import { createRouter, manifestFor } from "@uniswap/router-lite-sdk";

const client = createPublicClient({ transport: http(process.env.RPC_URL!) });
const router = createRouter({ client, manifest: manifestFor(1) });

const res = await router.getSwap({
  tokenIn: "0x40AAf75454036Bed56F3266cCf18f6b7befd6Aca",
  tokenOut: "0x7987f03462200b3D8A072E02C89A8A41dCB124EE", // USDC
  amountIn: parseEther("1"),
  trader: "0x0000000000000000000000000000000000000009",
  signal: AbortSignal.timeout(60_000),
});

console.log(res.status); // ready = simulated-executable; needs-action still carries tx
if (res.status === "ready" || res.status === "needs-action") {
  console.log(
    "route:",
    res.best.route.legs.map((l) => l.pool.protocol).join(" → ")
  );
  console.log("quote:", res.best.quote.amountOut);
  console.log("tx:", res.tx.to, res.tx.value);
  console.log("calldata:", res.tx.data);
  console.log("limits:", res.limits); // minAmountOut + deadline actually encoded
  console.dir(res, { depth: 5 });
} else {
  console.log(res.reason, res.search);
}

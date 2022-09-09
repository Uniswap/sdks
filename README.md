# gouda-sdk

SDK for the Gouda protocol

## Usage

The SDK contains bindings for two main flows: parsing serialized orders & building new orders.

### Parsing Orders
```ts
import { parseOrder, IOrder, OrderValidation } from '@uniswap/gouda-sdk';

const serializedOrder = '0x1111222233334444555500000000234300234...';
const order: IOrder = parseOrder(serializedOrder);
switch (order.validate()) {
  case OrderValidation.Expired:
    throw new Error('OrderExpired');
    ...
}

const orderData = order.info;
const orderHash = order.hash();
```


### Building Orders

```ts
import { DutchLimitOrder } from '@uniswap/gouda-sdk';

const chainId = 1;
const builder = new DutchLimitOrderBuilder(chainId);
const order = builder
  .deadline(deadline)
  .endTime(deadline)
  .startTime(deadline - 100)
  .nonce(BigNumber.from(100))
  .input({
    token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    amount: BigNumber.from('1000000'),
  })
  .output({
    token: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    startAmount: BigNumber.from('1000000000000000000'),
    endAmount: BigNumber.from('900000000000000000'),
    recipient: '0x0000000000000000000000000000000000000000',
  })
  .build();

const { domain, types, values } = order.permitData();
const signature = wallet._signTypedData(domain, types, values);

const serializedOrder = order.serialize();
// submit serializedOrder and signature to order pool
```

### Order Object

**serialize()**

Returns an abi-encoded serialization of the order. This serialized format is passed into the corresponding reactor contract for execution.


**getSigner(signature)**

Recovers the address which created the given signature over the order. Used to determine the order maker.


**permitData()**

Returns the domain, types, and values used to generate an EIP-712 signature over the order. Note that this signature both approves the release of the order's input tokens _and_ the execution of the order itself.


**hash()**

Returns the order hash. This is used as a key to track order fulfillment on-chain. It may also be useful as a unique order identifier for off-chain purposes.

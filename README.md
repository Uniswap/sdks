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
TODO: add nice builder helper

```ts
import { DutchLimitOrder } from '@uniswap/gouda-sdk';

const order = new DutchLimitOrder({
  reactor: '0x1234',
  nonce: 0,
  deadline: 1662160861,
  startTime: 1662150861
  endTime: 1662160861,
  input: {
    token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    amount: '10000000000',
  },
  outputs: [
    {
       token: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
       startAmount: '1000000000000000000',
       endAmount: '900000000000000000',
       recipient: '0x0000000000000000000000000000000000000000',
    },
  ],
}, 1);

const digestToSign = order.digest();
const signature = <sign digestToSign with wallet>

const serializedOrder = order.serialize();
// submit serializedOrder and signature to order pool
```


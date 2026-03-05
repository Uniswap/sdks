# Pattern Recognition

## Patterns to Flag

**Mixed concerns:**

```ts
async function handleUserAction(userId, action) {
  if (!userId) throw new Error('Invalid user');
  const user = await db.getUser(userId);
  const result = processAction(user, action);
  await db.save(result);
  return result;
}
```

**Suggest:**

"Four responsibilities here. Splitting them makes testing easier - each piece testable without mocking the others."

**Hardcoded dependencies:**

```javascript
import { stripeClient } from './stripe';
async function chargeCard(amount) {
  return stripeClient.charge(amount);
}
```

**Suggest:**

"Accepting the payment client as a parameter makes this testable and swappable:

```javascript
async function chargeCard(amount, paymentClient) {
  return paymentClient.charge(amount);
}
```"

## Good Practices to Recognize

When you see good code, acknowledge it briefly:

- Clean separation of concerns
- Pure functions that are easy to test
- Appropriate error handling
- Clear naming that documents intent

# Vercel Web Analytics Integration

This repository has `@vercel/analytics` installed and ready for integration with web applications.

## Prerequisites

1. Enable Analytics in your Vercel dashboard:
   - Navigate to your project in the Vercel dashboard
   - Click on Analytics in the sidebar
   - Click "Enable" to activate Web Analytics

## Integration Instructions

### For Next.js Applications (App Router)

If you add a Next.js application with the App Router to this monorepo:

1. Import the Analytics component in your root layout file (e.g., `app/layout.tsx`):

```typescript
import { Analytics } from '@vercel/analytics/next';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

### For Next.js Applications (Pages Router)

If you add a Next.js application with the Pages Router:

1. Add the Analytics component to your `_app.tsx` or `_app.js` file:

```typescript
import { Analytics } from '@vercel/analytics/next';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}
```

### For React Applications

If you add a standalone React application:

```typescript
import { Analytics } from '@vercel/analytics/react';

function App() {
  return (
    <>
      {/* Your app content */}
      <Analytics />
    </>
  );
}
```

### For Static HTML Sites

If you want to add analytics to a static HTML site (like Jekyll):

1. Add the following script tag to your HTML files, typically before the closing `</body>` tag:

```html
<script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/_vercel/insights/script.js"></script>
```

## Verification

After deploying your changes to Vercel:

1. Open your deployed site in a browser
2. Open the browser's Developer Tools (Network tab)
3. Look for a Fetch/XHR request to `/_vercel/insights/view`
4. If you see this request, Web Analytics is working correctly

## Local Development

Web Analytics will only send data in production by default. During local development, the component will render but won't send tracking data.

To test analytics in development mode (for debugging), you can use:

```typescript
<Analytics mode="development" />
```

## Documentation

For more information, visit:
- [Vercel Web Analytics Documentation](https://vercel.com/docs/analytics)
- [Quickstart Guide](https://vercel.com/docs/analytics/quickstart)

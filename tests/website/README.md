# Focused authentication UI regression

With the local website running and Playwright/system Chromium available, run:

```sh
UNIBOS_TEST_BASE_URL=http://127.0.0.1:3130 node tests/website/auth-step-up.cjs
```

The server must be on loopback. The test mocks every `/api/*` response with synthetic data and checks existing-session TOTP/recovery-code verification, invalid-code handling, fresh enrollment (including returning from the existing-factor choice), and normal password-login MFA. It verifies that existing-factor flows never request enrollment or factor material.

This is a browser UI regression, not proof of backend authentication. Run the existing real P2 security tests separately. The default Chromium executable is `/usr/bin/chromium`; override `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when needed. The test does not start, stop or provision any service.

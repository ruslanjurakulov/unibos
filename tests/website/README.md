# Focused authentication UI regression

With the local website running and Playwright/system Chromium available, run:

```sh
UNIBOS_TEST_BASE_URL=http://127.0.0.1:3130 node tests/website/auth-step-up.cjs
```

The server must be on loopback. The test mocks every `/api/*` response with synthetic data and checks existing-session TOTP/recovery-code verification, invalid-code handling, fresh enrollment (including returning from the existing-factor choice), and normal password-login MFA. It verifies that existing-factor flows never request enrollment or factor material.

This is a browser UI regression, not proof of backend authentication. Run the existing real P2 security tests separately. The default Chromium executable is `/usr/bin/chromium`; override `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when needed. The test does not start, stop or provision any service.

## P4.3 synthetic service workflow

With the local website running on loopback and Playwright/system Chromium available, run:

```sh
UNIBOS_TEST_BASE_URL=http://127.0.0.1:3132 node tests/website/p43-service.cjs
```

This browser test exercises the same-page synthetic cashier → kitchen → waiter flow, reduced motion, UZ/RU/EN, dark theme and horizontal overflow at 320, 390, 768, 1024, 1366, 1440 and 1920 pixels. It does not test the authenticated API or cross-device synchronization. Screenshots go to `/workspace/work/p4.3-qa`.

# Security Model

## Threat posture
This platform is designed for sensitive government office workflows. Assume hostile network adjacency and privileged insider misuse. Demo credentials and shared access codes are forbidden.

## Controls
- Unique user accounts with strong password policy (min 12 chars, complexity)
- Mandatory TOTP MFA after enrollment
- Short-lived JWT access tokens + rotating refresh tokens (hashed at rest)
- Role-based access control (SPEAKER, SECRETARY_GENERAL, SPECIAL_SECRETARY, DG_IT, ADMIN)
- Envelope encryption for Confidential attachments (AES-256-GCM; DEK wrapped by master key)
- Time-boxed vault unlock grants recorded in the audit ledger
- Append-only hash-chained audit events with DG IT verification endpoint
- Upload rate limits and optional antivirus hook interface
- Secrets only via environment / vault — never committed

## Deployment
Prefer on-prem Docker Compose behind TLS termination. Set `COOKIE_SECURE=true` and rotate all keys before go-live.

## Verification
1. Register two users in different roles
2. Create a Confidential matter, unlock with file password, route, decide
3. Call `GET /audit/verify` as DG IT — chain must validate

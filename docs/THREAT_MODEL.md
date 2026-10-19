# Threat Model (STRIDE summary)

| Threat | Mitigation |
|--------|------------|
| Spoofing | MFA + unique accounts; optional LDAP/AD |
| Tampering | Hash-chained audit; signed e-seal records |
| Repudiation | Immutable audit with actor, IP, user-agent |
| Information disclosure | Envelope encryption; vault TTL; RBAC |
| Denial of service | Rate limits; upload size caps |
| Elevation of privilege | Role guards on every mutation |

Out of scope until client SOC engagement: formal certification, HSM provisioning, air-gap image signing.
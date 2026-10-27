# UAT handoff packs

**Index:** [TESTER_HANDOFF.html](./TESTER_HANDOFF.html)

| Pack | File | Prefix | Length | Theme |
|------|------|--------|--------|-------|
| Pack 01 | [TESTER_HANDOFF_01.html](./TESTER_HANDOFF_01.html) | `UAT-P01` | Full | Cultural evening — protocol advice |
| Pack 02 | [TESTER_HANDOFF_02.html](./TESTER_HANDOFF_02.html) | `UAT-P02` | Full | Mid-year budget brief — finance coordination |
| Pack 03 | [TESTER_HANDOFF_03.html](./TESTER_HANDOFF_03.html) | `UAT-P03` | Full | Standing Committee visit — logistics |
| Pack 04 | [TESTER_HANDOFF_04.html](./TESTER_HANDOFF_04.html) | `UAT-P04` | Full | Media Day — press coordination |
| Pack 05 | [TESTER_HANDOFF_05.html](./TESTER_HANDOFF_05.html) | `UAT-P05` | Full | National Day greetings — protocol cards |
| Pack 06 | [TESTER_HANDOFF_06.html](./TESTER_HANDOFF_06.html) | `UAT-P06` | Short | Short smoke — core path only |

No personal names — only pack numbers and `UAT-P0x` prefixes.

Steps use exact nav labels (`Files & documents`, `Dak register (R&I)`, `Acknowledge receipt`, `Generate summary`, `E-Sign & Seal Document`, etc.).

```bash
npm run prepare:uat -w @gow/api
node docs/generate-tester-handoffs.mjs
```

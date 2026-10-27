# Staff directory / users / LDAP — research & module completion

**Module:** People (`/people`)  
**Consultation / ops:** Local role directory for pilot; live AD/SSO = production Tier B (IMPLEMENTATION B.01)

## R&D summary

| Requirement | Pilot implementation |
|-------------|----------------------|
| Role directory | All local users with role cards, search, filters |
| Messaging | Deep link `/messages?to=` for active accounts |
| Admin create | ADMIN / DG_IT · password policy · audit + inbox notice |
| Profile manage | PATCH display name / email / role / activate |
| LDAP / AD | Stub mode by default; real sync when `LDAP_ENABLED=true` |
| Live SSO | **Out of scope** (Tier B) |

## How to test

1. Open `/people` — seeded officers appear; KPIs show counts.  
2. Search / filter by role.  
3. As **admin**: Create user → appears in directory → **Manage** → edit / deactivate.  
4. **Message** opens messages with recipient.  
5. LDAP panel: mode `stub`; **Test sync** returns friendly stub message (no error).  

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/users?q=&role=&active=` | Directory list |
| GET | `/users/:id` | Detail |
| POST | `/users` | Create (ADMIN, DG_IT) |
| PATCH | `/users/:id` | Update / activate |
| GET | `/ldap/status` | Stub or configured status |
| POST | `/ldap/sync` | Stub OK when disabled; AD pull when enabled |

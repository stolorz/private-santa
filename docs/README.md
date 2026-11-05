# Private Santa — code reference

How the app is structured. Product features: [README.md](../README.md).
Local setup: [setup.md](setup.md).
Rules for agents (invariants, coverage, deploy): [AGENTS.md](../AGENTS.md).

| Doc | Read when you need |
|---|---|
| [setup.md](setup.md) | Run it locally: env, backup, integrations, scripts |
| [architecture.md](architecture.md) | Routes, auth, guest vs organiser flows, `basePath` |
| [data-model.md](data-model.md) | Tables, uniqueness, person vs guest, codes vs tokens |
| [api.md](api.md) | Every HTTP handler |
| [domain.md](domain.md) | `lib/` modules and algorithms |
| [ui.md](ui.md) | Components and client data flow |
| [testing.md](testing.md) | Vitest, helpers, coverage include/exclude |

Start with architecture, then the data model. Domain and API are the source of
truth for behaviour; the tests next to the source are the spec for edge cases.

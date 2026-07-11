# Vendored event-tagging SDK (read side)

Verbatim copies of the read-side core of Tapestry's event-tagging SDK (ADR 0036, Decision 2).

| Field | Value |
|---|---|
| Source repo | `github.com/nous-clawds4/tapestry` (public) |
| Branch | `feat/tags` |
| Commit | `42596656` |
| Copied | 2026-07-11, from the in-repo clone `tapestry/src/lib/event-tagging/` |
| Files | `handles.js`, `filters.js`, `classify.js` — dependency-free CJS; `classify.js` has zero imports, `filters.js` imports only `handles.js` |

**Do not edit these files.** They are byte-for-byte copies so drift against upstream stays auditable:

```
diff -r api/_lib/event-tagging tapestry/src/lib/event-tagging   # (extra upstream files are expected)
```

To refresh: update the `tapestry/` clone to the desired `feat/tags` commit, re-copy the three files,
and update the commit + date here. Any local change requires noting it in this file and in ADR 0036.

The write-path and projection files (`apply.js`, `builders.js`, `taggings.js`, `applicability.js`,
`slug.js`, `index.js`) are deliberately **not** vendored — this app reads only (Story 8).

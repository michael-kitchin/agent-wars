---
description: "14 — No secrets or PII in version control"
alwaysApply: true
---

# 15 — No secrets or PII in Version Control

Do not commit real secret values (examples: credentials, API keys, credit card numbers) or PII (examples: real names, ID numbers, or contact information for a real person). This applies to production source, comments, configuration (examples: properties files, Docker Compose files), documentation, and anything else that is or is likely to be in version control, except as described below. A public organizatioinal contact address is not PII.

Names and references that are allowed include: environment variable names, parameter names, and secret-store paths, with no secret value beside them. Files, parameters, and other mechanisms that read, store, or transmit secrets and PII are allowed. Keep real values in a gitignored file or a remote store. Prefer (but do not require) a remote secret store such as AWS Secrets Manager or an encrypted database column.

Do not write production code that stores, manages, or transmits secrets or PII in cleartext or over an unencrypted channel, except when the current request explicitly confirms it. Confirmation allows that handling, but does not allow real secrets or PII to be committed.

Sample secrets and sample PII are allowed only in a section of the codebase dedicated to testing, such as test source or fixture files. A comment, note, or documentation within or adjacent to that section must indicate that these values are for testing. These values must not be real or real-looking credentials, keys, or PII. Dedicated test code may store, manage, and transmit secrets and PII in cleartext or over an unencrypted channel without confirmation.

Obvious local-only placeholders are also allowed in committed local configuration. These must be clearly fake defaults for local use, not real credentials or real PII.

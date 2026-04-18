Place optional OpenClaw model-auth seed files here when you want the container
to start with an external provider login already provisioned.

Supported seed files:

- `auth-profiles.json`
- `auth.json`

At container startup, the OpenClaw entrypoint copies any present files from this
directory into the writable agent state directory:

- `/var/lib/openclaw/state/agents/<OPENCLAW_AGENT_ID>/agent/`

Recommended flow for OpenAI Codex OAuth:

1. Run the Ægis export helper on the host:

```bash
pnpm openclaw:export-codex-auth
```

Or explicitly:

```bash
node scripts/export-openclaw-codex-auth.mjs \
  --source "$HOME/.pi/agent/auth.json" \
  --agent-dir /Users/andreas/Documents/code/aegis/docker/openclaw-auth-seed \
  --profile-id openai-codex:default
```

2. Confirm the generated files are present in this directory.
3. Start the Docker stack.

This follows the same pattern used in `socrates-methodical`: auth is generated
outside the container, mounted read-only, and then seeded into the OpenClaw
agent state on startup.

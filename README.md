# harness-config

**Declare your AI coding setup once, install it to any harness.**

`harness-config` reads a declarative YAML manifest and installs MCP servers, agents, skills, rules, and commands to the correct locations for whichever AI coding harnesses you support.

## Supported Harnesses

- Claude Code
- GitHub Copilot (VS Code, copilot CLI, etc.)
- OpenCode
- Pi
- IBM Bob

## Quick Start

```bash
# Install from a manifest in the current directory
npx @justinclayton/harness-config add

# Install from a specific file
npx @justinclayton/harness-config add ./my-config.yaml

# Install to specific harnesses only
npx @justinclayton/harness-config add --harness claude --harness opencode

# Remove everything a manifest declares
npx @justinclayton/harness-config rm
```

## Manifest Format

Create a `harness-config.yaml` in your project root:

```yaml
name: my-project
description: AI coding setup for my project

harnesses:
  claude:
    agents:
      - ./agents/planner.md
      - ./agents/reviewer.md
  opencode:
    agents:
      - ./agents/planner.md
      - ./agents/reviewer.md
  copilot:
    agents:
      - ./agents/planner.md
  pi:
    skills:
      - ./skills/terraform-planning

mcps:
  terraform:
    stdio: "docker run -i --rm hashicorp/terraform-mcp-server:0.5.1"
    env:
      - TFE_TOKEN

  github:
    url: https://api.githubcopilot.com/mcp/
    auth: env:GH_TOKEN

skills:
  - ./skills/terraform-planning
```

### MCP Servers

Two transport types:

```yaml
mcps:
  # stdio: command string split into command + args
  local-server:
    stdio: "node server.js --port 3000"
    env:
      - API_KEY                          # passthrough from host env
      - SECRET: keychain:my-secret       # macOS Keychain resolution

  # HTTP/SSE: url + optional auth/headers
  remote-server:
    url: https://api.example.com/mcp/
    auth: env:TOKEN                      # → Authorization: Bearer <value>
    headers:
      X-Tenant-ID: env:MY_TENANT
```

### Harness-Specific Components

For components that differ per harness (agents, rules, commands), use the map form:

```yaml
harnesses:
  claude:
    rules:
      - ./rules/claude/style.md
    skills:
      - ./skills/claude/special-skill
  opencode:
    commands:
      - ./commands/opencode/deploy.md
  pi:
    skills:
      - ./skills/pi/special-skill
```

### macOS Keychain Integration

For MCP servers with secrets like API keys, you can avoid storing use them in plaintext by instead referencing them in macOS Keychain using the `keychain:` prefix. A wrapper script will be generated that resolves credentials at runtime before running the MCP.

```yaml
mcps:
  private-server:
    stdio: "my-server --mode production"
    env:
      - DB_PASSWORD: keychain:db-password
      - API_SECRET: keychain:api-secret
```

## CLI Reference

```
harness-config add [manifest-path] [options]
harness-config rm [manifest-path] [options]
```

| Flag | Description |
|------|-------------|
| `--harness <name>` | Target harness (repeatable: claude, opencode, copilot, pi, bob) |
| `--global`, `-g` | Write to global configs instead of project |
| `--yes`, `-y` | Skip confirmation prompts |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show version |

## License

MIT

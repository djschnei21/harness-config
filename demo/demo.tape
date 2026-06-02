# harness-config demo
# Run: make demo (or: vhs demo/demo.tape)

Output demo/demo.gif

Require node

# Terminal settings
Set Shell "bash"
Set FontSize 15
Set Width 1000
Set Height 700
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set CursorBlink false

# ─── Setup: copy fixtures into a temp workspace (hidden) ──────────────────────

Hide
Type `cd /tmp && rm -rf harness-config-demo && cp -r DEMO_FIXTURES harness-config-demo && cd harness-config-demo`
Enter
Sleep 1s
Type "clear"
Enter
Sleep 500ms
Show

# ─── Scene 1: Show the manifest ───────────────────────────────────────────────

Type "cat harness-config.yaml"
Enter
Sleep 3s

# ─── Scene 2: Run harness-config add ──────────────────────────────────────────

Type "npx harness-config add --yes"
Enter
Sleep 4s

# ─── Scene 3: Show what was generated ─────────────────────────────────────────

Type "# Let's see what was generated:"
Enter
Sleep 1s

Type "find . -name '*.json' -o -name 'SKILL.md' | grep -v node_modules | sort"
Enter
Sleep 2s

Type "cat .mcp.json | head -20"
Enter
Sleep 3s

# ─── Scene 4: Show harness-specific output ────────────────────────────────────

Type "cat .pi/skills/code-review/SKILL.md"
Enter
Sleep 3s

Type "# One manifest. Every harness configured. ✨"
Enter
Sleep 3s

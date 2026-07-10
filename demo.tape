Output demo.gif
Set FontSize 15
Set Width 1000
Set Height 560
Set Theme "Catppuccin Mocha"
Type "npx ai-universal-memory init"
Enter
Sleep 4s
Type "node .memory/tools/cli.mjs todo 'Ship v0.3' --agent claude-code"
Enter
Sleep 1.5s
Type "node .memory/tools/cli.mjs decision 'Vendored engine over npm dependency' --agent claude-code"
Enter
Sleep 1.5s
# Simulates what the PostToolUse hook does automatically on every real edit — no LLM.
Type "echo '{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"src/index.js\"},\"session_id\":\"demo1234\"}' | node .memory/tools/auto-capture.mjs"
Enter
Sleep 1.5s
Type "echo '{\"session_id\":\"demo1234\"}' | node .memory/tools/session-stop.mjs"
Enter
Sleep 1.5s
Type "node .memory/tools/cli.mjs brief"
Enter
Sleep 5s

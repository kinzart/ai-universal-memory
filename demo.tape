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
Type "node .memory/tools/cli.mjs brief"
Enter
Sleep 5s

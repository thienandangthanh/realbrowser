---
display_name: "Realbrowser"
short_description: "Target-first local Chrome/Brave control"
default_prompt: "Use $realbrowser for target-first local browser automation: inspect existing signed-in tabs before creating, keep labels/defaults owner-scoped for parallel agent sessions, respect target leases before mutating, reuse DevToolsActivePort direct WebSocket endpoints to avoid repeated Chrome approval prompts, ask approval before last-resort profile relaunch recovery, acquire one labeled target, keep reads compact or write large reads/network bodies to --out, copy exact-tab console lines verbatim, and use root-scoped uploads plus guarded submits."
policy:
  allow_implicit_invocation: true

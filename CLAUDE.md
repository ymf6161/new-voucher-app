# Deposit Tracker

## Session rules

- **Firewall/network blocks:** if any tool call is blocked by the outbound proxy or a firewall, stop immediately — do not retry, do not try to route around it. Report the exact URL (or host) that was blocked back to the user so they can whitelist it. Do not keep attempting variations of the same request.

## gstack

This project has [gstack](https://github.com/garrytan/gstack) vendored at `.claude/gstack/`, with each skill symlinked into `.claude/skills/` so Claude Code picks them up automatically as project skills. Use these for their intended workflows instead of ad hoc equivalents — e.g. use the `/browse` skill for web browsing/QA instead of generic browser-automation tools.

Available skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`, `/spec`, `/context-save`, `/context-restore`, `/pair-agent`, `/scrape`, `/skillify`, `/health`, `/landing-report`, `/make-pdf`, `/diagram`, `/plan-tune`, `/sync-gbrain`, `/ios-clean`, `/ios-design-review`, `/ios-fix`, `/ios-qa`, `/ios-sync`.

To keep this up to date, re-run the vendoring: `git clone --depth 1 https://github.com/garrytan/gstack.git` into a scratch dir, copy over `.claude/gstack/` (excluding `.git` and `browse/test`), and re-link any new skill directories under `.claude/skills/`.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

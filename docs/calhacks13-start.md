# Start working on Chassix-AI for Cal Hacks 13.0

## Current state

The GitHub repository is cloned locally. Its product is called **Chassix-AI**. A runnable interactive 3D visualization is available in `apps/web`; scientific execution and backend services remain unimplemented.

The active local branch is `feature/chassix-3d-visualization`. The visualization and setup documents are local, uncommitted changes.

Run `sh scripts/dev.sh` from the repository root and open http://127.0.0.1:5173/. See [the visualization guide](visualization.md) to continue the frontend work.

## Open the repository

```sh
cd /Users/monoswichakraborty/Documents/Codex/2026-10-24/https-github-com-abcoder1-chassix-ai/Chassix-AI
git status
```

In an editor, open this `Chassix-AI` folder as the project root.

Read:

1. [Product requirements](../Chassix-AI-PRD.md) — intended behavior and acceptance criteria.
2. [Design guide](../Chassix-AI-Design-Guide.md) — screens and prototype boundaries, including the Figma link.
3. [Implementation guide](../Chassix-AI-Implementation-Guide.md) — ordered work and definitions of done.
4. [Decision log](decisions.md) — open architecture and scientific contract decisions.

## First working session

1. Agree the demo audience and a narrow, end-to-end demonstration goal with the team.
2. Assign the technical and scientific decision owners in the decision log.
3. Complete the technical spikes, record D1–D10, and agree scientific contracts and the reference fixture. Keep the implementation tracker at Step 0 until the exit criteria are met.
4. Begin implementation Step 1.1: scaffold the application with the agreed framework, strict TypeScript, lint/test commands, environment examples, and CI. Document one reproducible local startup command.
5. Continue through the guide, delivering one reviewable step at a time and running its acceptance checks.

For a hackathon demonstration, propose a narrow flow: enter a goal → review unknowns → choose hosts and evidence → review a plan → inspect results and their sources. This is a proposed demo slice, not a replacement for the PRD or its execution and evidence requirements. Label fixture-driven screens and simulated jobs clearly; only present a real analysis as completed after its outputs have been validated.

## Local tools and credentials

Git and GitHub CLI are available, and GitHub authentication has been verified. The visualization uses Node.js 24, pnpm 11.25.0, React, Vite, TypeScript, and Three.js. Provider keys, remote compute, and storage configuration depend on the decisions above. Keep secrets out of committed files.

Before your first commit, configure the repository-local Git author name and email if they are unset. Use your own details, including a GitHub-provided no-reply email if preferred.

## A useful next request

“Help me complete Step 0 for a Cal Hacks demo: propose the stack and fixture contracts, record the outstanding scientific approvals, and prepare the first scaffold task.”

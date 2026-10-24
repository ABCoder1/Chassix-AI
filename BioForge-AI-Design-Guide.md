# BioForge AI — Design handoff

[Open the editable Figma file](https://www.figma.com/design/p6psFXPgPnXV69G7TWpfDb)

Created in **dev-team**. The file uses editable text, auto-layout frames, vectors, color variables and instances from the Simple Design System button library. Canvas dots and connecting curves are editable vector geometry rather than a flattened screenshot.

## Walkthrough

Start at **01 · Welcome** and choose **Build my workflow**. Continue through host comparison, datasets and plan review to the parallel analysis canvas. Use **Preview failure state** to inspect the partial-evidence decision or **Preview integration** to see harmonization and critic review. These preview controls demonstrate alternate asynchronous states without pretending to run scientific jobs.

From the failure view, **Retry failed analysis** returns to execution, **Review inputs** returns to datasets, and **Proceed with collected evidence** opens integration. **Explore results** opens the dashboard. On the dashboard, the host filter toggles between all candidates and candidate A; **Inspect claim and evidence** opens provenance; **What evidence is missing?** shows the contextual chat follow-up. **Browse files** opens the upload and validation design. The BioForge AI brand returns to the welcome screen.

## Screen inventory

1. Welcome and plain-language goal composer
2. RAG host ranking, host selection, rationale and evidence preview
3. Multiomics dataset selection and compatibility
4. Execution plan review and remote launch
5. Navy dotted canvas with parallel remote analyses and integration barrier
6. Partial-failure decision with retry, review and proceed paths
7. Evidence harmonization and scientific critic
8. Results dashboard with evidence coverage, comparison and AI chat
9. Claim and provenance detail
10. Host-filtered dashboard state
11. Private upload, sample mapping and validation
12. AI chat follow-up about missing evidence

## Prototype boundaries

This is an editable design and a click-through prototype. It does not query repositories, run analyses, accept real uploads, export reports or call an AI model. Connected hotspots demonstrate selected flows; remaining controls communicate the intended product behavior. Host identities, comparative bars, findings, timing and run identifiers are illustrative fixtures. No live scientific ranking or performance claim has been established.

## Implementation handoff

Use the [PRD](BioForge-AI-PRD.md) as the behavioral specification, including acceptance criteria and recovery rules. Components and colors can be inspected in Figma. The desktop screen size is 1440 × 1000. The proposed production layout must adapt to viewport size and provide a linear alternative to the spatial canvas.

The original conversation’s earlier implementation blueprint was not available as readable text. The PRD labels its architecture and delivery phases as proposals. Scientific tools, repository adapters, scoring policy and compute limits need validation before implementation.

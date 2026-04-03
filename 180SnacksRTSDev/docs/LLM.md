# 180SnacksRTS — LLM Working Notes

This document defines the **current preferred UI structure** for the runtime canvas.
Treat this as the visual/interaction baseline for future changes unless explicitly overridden.

## Scope

- App: `180SnacksRTS`
- UI files:
  - `public/index.html`
  - `public/styles.css`
  - `public/app.js`

## Preferred Pipeline UI Structure (Approved)

### 1) Grouping model

- The pipeline visuals are a **single movable cluster** rooted at `#pipelineGroup`.
- `#pipelineGroup` contains:
  - Pipeline Control card (`.core-widget`)
  - Branch tree (`#branchTree`) with:
    - SVG branch paths + nodes
    - Services card
    - Execution Logs card

This grouping allows dragging any pipeline card and moving the entire structure together (cards + branch lines).

### 2) Visibility model

- `#branchTree` remains hidden by default (`hidden` class).
- Branch tree appears after pressing **Run** (via `showRuntimeWidgets()` in `public/app.js`).
- This behavior is intentional and should be preserved.

### 3) Branch geometry model (shape and placement)

Approved structure:

- One vertical main trunk on the left side of the pipeline cluster.
- Two side branches split from the trunk and route to:
  - Services
  - Execution Logs
- Trunk terminates at the lower branch node height (no extra trunk tail below the final branch endpoint).
- Services + Logs cards are placed so their left edge sits between each branch elbow and endpoint marker.
- There is explicit vertical gap between Services and Logs cards (they must not feel merged/stacked too tightly).

### 4) Layering model

- Branch lines render behind cards.
- Pipeline Control card remains above the branch trunk where overlap occurs.
- Child cards overlay the small endpoint markers so the markers are not detached “floating” blocks.

### 5) Card opacity / panel appearance

- Cards are **solid** (non-transparent / non-see-through).
- Do not reintroduce translucent card panels or blur effects behind card bodies unless requested.

## Interaction Model (Approved)

### Canvas navigation

- Background drag pans the world.
- Mouse wheel zooms:
  - Wheel down → zoom out
  - Wheel up → zoom in
- Zoom is pointer-centered and clamped to sane bounds.

### Pipeline group drag

- Dragging a pipeline card drags the entire `#pipelineGroup`.
- Interactive controls (e.g., Run button, form controls, log text area behavior) should remain usable and not be hijacked by drag handling.

## Runtime Cleanup Policy

- Artifact cleanup runs at the end of **every** pipeline run (success or failure).
- `.xlsx` files are deleted from:
  - `IRIDev/artifacts/downloads`
  - `ExcelToAirtableDev/artifacts`

## Guardrails for Future Edits

When modifying the RTS UI:

1. Preserve the approved branch topology unless user explicitly asks for a new topology.
2. Keep Services/Logs spacing intentional and visually separated.
3. Keep cards solid and readable over the grid.
4. Keep branch tree gated by the Run action.
5. Maintain whole-group drag behavior and canvas pan/zoom behavior simultaneously.

## Quick Audit Checklist

Before finalizing any UI change in this app:

- [ ] Branch tree still hidden until run starts.
- [ ] Trunk + two side branches still match approved structure.
- [ ] Trunk does not extend below lower branch endpoint.
- [ ] Services and Logs are not cramped; spacing is obvious.
- [ ] Cards are opaque (no transparency bleed-through).
- [ ] Dragging any card moves full pipeline cluster.
- [ ] Canvas still pans and wheel-zooms correctly.

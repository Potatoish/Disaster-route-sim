# AGNAS: Responsive Layout and UI Fixes Spec

## How to use this spec
Work through the phases below in order. Rules for the whole task:

- **Start with Phase 0.** Inspect the codebase, report what you found, and propose a plan. Do not edit any file until I approve the plan.
- **One phase at a time.** After each phase: list every file you changed, summarize the changes, and tell me exactly what to test. Wait for my "go" before starting the next phase.
- **Do not change routing, ACO, hazard data, or backend logic.** This task covers layout, CSS, front-end interaction, and the specific UI items listed. Phase 8 is the only phase that touches wording or verdict logic, and it needs my explicit approval item by item.
- **Keep the current visual identity:** dark navy background, sky-blue accent, current fonts, light/dark theme toggle, current component style.
- If something in this spec conflicts with how the code actually works, stop and ask. Do not guess.

---

## Context
AGNAS (Ant Guided Navigation And Safety System) is our BSCS thesis web app: a Flask backend with a Leaflet map. It produces pedestrian evacuation routes for Barangay Pinagbuhatan and Barangay Sta. Lucia, Pasig City, for flood and earthquake scenarios.
Live site: https://agnas-route.up.railway.app/

Screens:
1. **Landing page:** pill nav (logo, Home, About & Contact, How to use, theme toggle), hero, "Select your Barangay" card, 3 info cards, then a hazard explainer section ("Flood depth" card and "Earthquake hazards" card), and a floating Feedback button.
2. **Simulator:** full-screen Leaflet map.
   - Setup panel on the LEFT (~375px): Disaster, Start / End, Run, Back to Home. It has a "Hide sidebar" toggle (Ctrl+B).
   - Results panel on the RIGHT (~340px). It appears after a run and shows the route selector, verdict, distance, peak flood level, note, and disclaimer.
   - Map overlays: Flood severity filter (top-left), Legend (bottom-left), Map/Satellite (top-right), Zoom (top-right).

Current problem: the site only works well on desktop, around 1920px wide. It must work on any device, from a 320px phone up to large desktops, including phone landscape.

---

## Mobile wireframes (source of truth for < 640px)
`docs/agnas-mobile-wireframes.html` contains low-fidelity wireframes of 8 mobile screens. Open it and read the numbered notes under each screen. Where this spec and the wireframes disagree, **the wireframes win for mobile layout**, and the spec wins for behavior and rules. Colors, fonts, and icons in the wireframes are placeholders: use the app's real design.

| # | Screen | Key elements |
|---|---|---|
| 01 | Landing, top | Collapsed nav (logo, theme, menu), headline without trailing comma, stacked barangay options with a check on the selected one, "Open simulator" button + helper line, icon-only Feedback button |
| 02 | Simulator, setup, sheet at peek | Floating top bar (back, barangay name, Layers button), fixed center pin above the sheet, zoom/locate above the sheet, Start and End slots with current values, "Set end here" + Run (disabled until both points exist) |
| 03 | Simulator, setup, sheet at half | Pin moves up with the sheet, Flood/Earthquake segmented control, Start/End slots with "Edit", Run pinned to the sheet bottom |
| 04 | Results, sheet at peek | Thick best route + thin alternates, time label on route, verdict box, "46 min · 3.80 km", "Edit setup" + "See details" |
| 05 | Results, sheet at full | Emergency hotlines row at top, verdict, 2×2 facts grid, route list (3 rows + "+ N more"), Disclaimer accordion, "New simulation" primary button, "Download report (PDF)" as a text link |
| 06 | Layers overlay sheet | Base map segmented control, flood severity chips, legend of visible items only, Done |
| 07 | Hazard guide (landing) | Flood levels as compact rows, full-width illustration with captions below, slider with readout, stacked summary |
| 08 | Landing, lower sections | "Before you start" stacked cards (the "Plan ahead" card emphasized, with a hotlines link), "How it works" as a vertical 3-step stepper, footer padded so Feedback never covers links |

Grey "?" callouts in the wireframes mark content that depends on Phase 8 decisions. Build the layout for them, but use the current wording until Phase 8 is approved.

---

## Breakpoints
Write the CSS mobile-first, with `min-width` media queries.

| Name | Width | Notes |
|---|---|---|
| Mobile | < 640px | Bottom sheet layout |
| Tablet | 640–1023px | Drawer layout |
| Laptop | 1024–1439px | Docked panels, setup auto-collapses after a run |
| Wide | ≥ 1440px | Current three-column layout |
| Phone landscape | height < 500px (any width) | Use the drawer layout, never the bottom sheet |

---

## Phase 0: Inspect and plan (no edits)
Report:
- The front-end stack (templates, JS framework if any, CSS approach, build step).
- Where the layout CSS and the map initialization live.
- How the setup and results panels are rendered and how they share state.
- Any existing media queries.
- A proposed phase plan, with anything in this spec that looks risky given the code.

---

## Phase 1: Global foundations
- Viewport meta must include `width=device-width, initial-scale=1, viewport-fit=cover`.
- Use `dvh` instead of `vh` for full-height layouts, with a `vh` fallback.
- Respect safe-area insets (`env(safe-area-inset-*)`) on every fixed or bottom-anchored element: the bottom sheet, the Feedback button, and the map controls.
- All tap targets must be at least 44×44px.
- Inputs and selects must use a font-size of at least 16px, so iOS doesn't auto-zoom.
- No horizontal page scroll at any width from 320px up.
- Give every interactive element a visible focus state.
- Respect `prefers-reduced-motion` for sheet, drawer, and map animations.
- **Leaflet resize fix:** add a `ResizeObserver` on the map container and call `map.invalidateSize()`, debounced to about 150ms, whenever the container's size changes. This covers breakpoint changes, panel collapse and expand, drawer toggles, and device rotation. Do not rely on media-query change events alone, because the container is still animating when they fire.
- After `invalidateSize()`, if a route is displayed, keep it in view with `fitBounds`. The padding must account for whichever panel, drawer, or sheet is currently covering the map.
- **Feedback button:** at < 640px, shrink it to an icon-only round button (keep an accessible label). On the simulator screen at < 640px, move it into the setup panel or the menu so it never overlaps the bottom sheet or the map controls.

---

## Phase 2: Simulator, laptop and wide layouts (≥ 1024px)

### Panel strategy
- **≥ 1440px:** keep the current layout: setup panel left, map center, results panel right.
- **1024–1439px:** keep both panels. When results appear, automatically collapse the setup panel to its narrow rail (reuse the existing "Hide sidebar" behavior). The user can expand it again, and Ctrl+B still works.
- Panels take a max width in rem, and the map must always keep at least 50% of the viewport width.

### Run button and setup panel behavior
- Once a run completes, change the "Run Simulation" button label to "Run again". Keep it disabled until the hazard, start, or end changes, then re-enable it with the label "Run simulation".
- Remove the "Simulation complete. Drag a pin or change the hazard…" paragraph from the RUN card. In its place, show this one line at the top of the results panel: "Change the hazard or move a pin to compare routes."

### Results panel content (all breakpoints)
These apply to the results panel at every width. On mobile, follow wireframes 04 and 05.
- **Emergency hotlines:** replace the red "Click here for emergency contact information" link at the end of the disclaimer with a full-width "Emergency hotlines" row at the TOP of the results panel. Use descriptive link text, never "Click here". Show the numbers as selectable text; on mobile, also make them `tel:` links.
- **Facts:** show distance, walking time, peak flood level, and routes checked in a 2×2 grid instead of three tall cards.
- **Routes:** replace the "See all 4 alternative routes" button with an inline route list. Show the top 3, then a "+ N more routes" expander. Each row: line swatch, route name ("Route 1 · best"), its worst hazard, and walking time. Tapping a row highlights that route on the map (on mobile, the sheet drops to half so the map is visible). Use only data the backend already returns. If "worst hazard per route" isn't available, show what is, and tell me.
- **Note bullets:** fold them into the route list. Remove the separate Note block.
- **Disclaimer:** a collapsed accordion, opened automatically on the first run of each session.
- **Actions:** "New simulation" is the one primary (filled) button. "Download report (PDF)" becomes a secondary text link below it. Remove the green outlined button style.

---

## Phase 3: Simulator, tablet layout (640–1023px, and phone landscape)
- The map is full width.
- Setup and results merge into **ONE panel with two modes**:
  - **Setup mode:** Disaster, Start / End, Run, Back to Home.
  - **Results mode:** route selector, verdict, distance, time, peak hazard, note, disclaimer, and an "Edit setup" button that returns to setup mode.
  - Running a simulation switches the panel to results mode automatically.
- The panel is an overlay **drawer from the left**: 360px wide, max 90vw (max 50vw in phone landscape), with a dim scrim behind it.
- A toggle button sits at the top-left of the map. Close the drawer on a scrim tap, the Esc key, or its close button.
- The drawer opens automatically after a run, so results are seen immediately.
- Tap the map to set start and end points, the same as on desktop.
- In phone landscape (height < 500px), use this drawer layout at any width, instead of the bottom sheet.

---

## Phase 4: Simulator, mobile layout (< 640px, portrait)
- The map is full screen (`100dvh`).
- The same two-mode panel from Phase 3 becomes a **bottom sheet** with three snap points:
  - **peek:** about 200px plus the bottom safe-area inset. It must fit the Start and End slots plus the action row (see wireframe 02). Measure the real content and set the peek to fit it, rather than hard-coding a number
  - **half:** 50dvh
  - **full:** 100dvh minus 64px
- **Drag:** dragging the handle or the sheet header resizes the sheet and snaps it to the nearest point on release.
- **Tap and keyboard:** the handle is a real `<button>` with an aria-label. Tapping it, or pressing Enter, cycles peek → half → full → peek.
- **Scrolling:** only the sheet's inner content scrolls, and only at half or full. The page itself never scrolls.
- **Peek content by mode:**
  - Setup mode: the selected hazard chip, a short start → end summary, and the Run button.
  - Results mode: the verdict chip and "34 min · 2.81 km"-style summary, plus an "Edit setup" button.
- **Height variable:** expose the sheet's current visible height as a CSS variable (`--sheet-h`) on the simulator root, so map controls can position themselves above the sheet.

### Choosing start and end on mobile (center-fixed pin)
- Show a fixed pin at the **center of the visible map area**: the space between the top of the screen (or the top bar) and the top of the sheet. Do not use the center of the whole viewport, because the sheet covers it.
- The user pans the map under the pin, then taps "Set start here" or "Set end here" in the sheet. The button shows whichever point is still missing (wireframe 02).
- Each Start/End slot shows its current value, or a dashed empty state that says what to do next. Tapping "Edit" on a slot collapses the sheet to peek and centers the map on that point, ready to move it (wireframe 03).
- Run stays disabled until both points exist.
- When the sheet height changes, move the pin to the new visible center **and pan the map by the same amount**, so the chosen point stays under the pin.
- While the map is being dragged, lift the pin slightly for feedback.
- Keep the existing S and E markers for the points already chosen.

---

## Phase 5: Map overlays and route styling (all sizes)

### Consolidate overlays
Today there are 4 floating boxes: flood severity, legend, map/satellite, and zoom. Reduce them to:
- **Zoom +/−** and a **Locate me** button: bottom-right. On mobile, offset them above the sheet with `--sheet-h`.
- One **Layers** button at the top-right. It opens a panel with three sections:
  1. Base map (Map / Satellite)
  2. Flood severity filter (Low / Medium / High / All)
  3. Legend

  On desktop, show it as a popover. At < 640px, show it as its own sheet or a full-width panel.

### Legend
Only list items that are currently on the map. For example, hide "Eliminated Route" when no route has been eliminated.

### Route styling
- **Best route:** replace the green. Green on the orange and red flood zones is hard to distinguish for red-green colorblind users. Use the sky-blue accent with a dark outline (casing), so it stays readable over every flood color and on satellite imagery. Check the contrast in light theme, dark theme, and satellite view. If the blue is too close to the river color, propose an alternative before applying it.
- **Available routes:** today they render as short, thick, disconnected purple dashes that look like data errors. Draw them as thin continuous lines at 40–50% opacity, below the best route.
- **Eliminated routes:** thin, dashed, low opacity, and only when the user turns them on in the Layers panel.
- **Route time/distance label:** keep it on the route. On mobile, if it collides with the pin or the controls, move it into the sheet's peek row.

---

## Phase 6: Landing page

### Layout
- **Nav:** at < 640px, show the logo, the theme toggle, and a menu button. The links open in a full-width menu, which closes on link click and on Esc. At ≥ 640px, keep the pill nav.
- **Hero and "Select your Barangay" card:** side by side at ≥ 1024px. Below that, stack them with the card under the hero text, full width.
- **Barangay options (Pinagbuhatan / Sta. Lucia):** side by side when they fit; stacked at < 400px.
- **Info cards (ACO / Safety over distance / 2):** 3 columns at ≥ 1024px, 1 column below 640px, and 2 + 1 or 3 columns in between, whichever has no orphan.
- **Animated network background:** keep it, but reduce its opacity behind the text column, using a gradient mask or lower opacity in that region, so the eyebrow, headline, and paragraph stay readable. Pause the animation under `prefers-reduced-motion`.

### Lower sections ("Before you start", "How it works", footer)
Follow wireframe 08 on mobile.
- **Before you start:** 3 columns at ≥ 1024px, stacked below. Give the "Plan ahead, not during an emergency" card a stronger border than the other two, and add an "Emergency hotlines" link to it (same destination as the results panel row).
- **How it works:** 3 columns at ≥ 1024px. Below 640px, make it a vertical stepper: a numbered circle and a connecting line on the left, and title, diagram, and text on the right. Shrink the diagrams to about 64px tall. Their monospace captions ("Independent, parallel search", etc.) move below the diagram as normal body text, at 12px or larger.
- **Footer:** add bottom padding at every width so the floating Feedback button never covers "Privacy Policy" or "Terms of Service". Check that both pages exist; if they don't, tell me instead of linking to nothing.

### Small fixes (no discussion needed)
- Remove the trailing comma from the headline "Disaster Preparedness for safer communities,".
- Rename the "See map" button to "Open simulator". This matches its helper text ("Opens the simulator pre-set to your choices above").
- Check that the logo reads as "AGNAS" at small sizes, where the ant icon stands in for the "A". If it reads as "GNAS", add the letter A back as text next to the icon, or add a visually hidden full name. Show me a screenshot before changing the logo.

---

## Phase 7: Hazard explainer section (Flood depth + Earthquake hazards)

### Layout
- ≥ 1024px: two columns (current). Below that, stack the cards, flood card first.
- **Flood level cards (Low / Medium / High):** 3 columns at ≥ 640px. Below that, stack them as compact rows: icon, name, and range on one line, description below.
- **Illustrations (SVG):** scale with `viewBox` and `width: 100%`, preserving the aspect ratio. Labels inside the SVGs ("Adult 162 cm", "Child 130 cm", "Loose, wet sand", "Groundwater", "Firm soil", axis ticks) must render at 12px or larger on a 360px screen. If they would be smaller, hide them in the SVG and show them as HTML captions or a key below the image.
- **Water depth slider:** the thumb touch area must be at least 44px. The value readout ("0.75 m") stays next to the label at all widths. Tick labels must not overlap at 360px; drop the intermediate ticks if needed.
- **"Water reaches / Level / Road" summary:** two columns (label, value) at ≥ 640px; stacked, label above value, below that.
- **Earthquake layer options:** stack vertically at < 640px.

### Interaction fixes
- **Ground shaking / Liquefaction:** they are toggle switches, but only one layer shows at a time ("Showing: Ground shaking"). Switches suggest both can be on together. If only one can show at a time, replace them with a segmented control or radio-style cards, matching the flood level cards. If both can really be on together, keep the switches, but the illustration must then show both. Tell me which one the code actually supports before changing it.
- **Animation:** play it automatically when a layer is selected (unless `prefers-reduced-motion` is set). Keep the "Simulate" button as a "Replay" button.

---

## Phase 8: Content and safety wording (needs my approval per item)
**Do not implement any item in this phase until I approve it.** For each item, show me the current text and logic, and your proposed change, then wait.

1. **Route verdict tiers.** The simulator shows "Safe route found" even when the route crosses Moderate flooding (0.5–1.0 m). Our own explainer defines that level as "Knees to waist" and "Hard to walk. Carry small children." Proposed tiers, from the data the results panel already has:
   - No hazard crossed → **"Safe route found"** (green)
   - Highest level crossed is Low → **"Safest available route: crosses low flooding"** (yellow)
   - Highest level crossed is Medium → **"Safest available route: crosses moderate flooding"** (amber), plus a line: "Hard to walk. Carry small children."
   - Highest level crossed is High, or no route found → **"No safe walking route"** (red), plus a line: "Stay where you are and follow barangay instructions."

   Change the verdict label and styling only. Do not change how routes are selected.
2. **Note text.** "We checked 5 routes — 5 are completely safe" contradicts itself when the best route crosses flooding. Change it to count routes by the highest hazard level each one crosses.
3. **"Road: Passable" in the flood explainer.** AGNAS plans walking routes only. Show me where "Passable" comes from. Then propose pedestrian wording (for example, "Walk only if no other route") or a cited source.
4. **Flood range boundaries.** Low is "0.1–0.5 m" and Medium is "0.5–1.0 m", so 0.5 falls in both. Change the labels to "0.1 to under 0.5 m", "0.5 to under 1.0 m", and "1.0 m and up", and state what 0–0.1 m counts as. First confirm what the classification code actually does at exactly 0.5 and 1.0, and make the labels match the code, not the other way around.
5. **Earthquake levels.** "Level: High" and "Moderate to High" have no scale. If the PHIVOLCS data includes an intensity value (for example, PEIS), show it next to the level.
6. **Landing info cards.** "ACO", "Safety over distance", and "2" are styled as statistics but aren't statistics, and "How it works" already explains the same ideas better. Recommended: remove the stat row and move the "How it works" section up into its place (the mobile wireframes assume this). Alternative: replace the cards with real figures from our data (for example, evacuation centers covered). I'll choose.
7. **"How it works" step 3 copy.** It says dangerous roads are crossed out first, then the shortest remaining route is picked ("Safety before distance, always"). Show me which flood levels the code actually removes. Then propose copy that names them (for example, "Routes through high flooding are removed first"), so the explanation matches routes that cross moderate flooding.
8. **Route detour reason.** Some best routes start by heading away from the destination. If the backend knows why (for example, which hazard segment it avoided), propose a short line for the route row, such as "Detours around high flooding on [street]". If the backend doesn't provide this, say so. Do not invent a reason in the front end.

---

## Phase 9: Acceptance test
Test in Chrome DevTools at: **320×640, 360×740, 390×844, 768×1024, 1024×768, 1366×768, 1440×900, 1920×1080, and 844×390 (phone landscape)**, in both light and dark theme.

At every size:
- [ ] Landing → pick barangay → open simulator → choose hazard → set start/end → run → view results → edit setup → run again: the whole flow works.
- [ ] Map shows no grey or missing tiles after resizing, rotating, collapsing a panel, or opening the drawer or sheet.
- [ ] In setup mode, the Run button is reachable without scrolling.
- [ ] The verdict, time, and distance are visible without opening the full sheet or drawer.
- [ ] Map controls and the Feedback button are never hidden behind a panel, drawer, or sheet.
- [ ] No horizontal page scroll, no clipped text, no overlapping overlays.
- [ ] Text in SVG illustrations is readable (12px or larger).
- [ ] Keyboard only: every control can be reached and operated, and the focus is visible.
- [ ] Emergency hotlines are visible at the top of the results without scrolling in the panel (desktop) or at full sheet (mobile).
- [ ] The Feedback button never covers footer links, map controls, or sheet content.
- [ ] At < 640px, each screen matches its wireframe (01–08) in structure and order.

Report the results as a table: rows are screen sizes, columns are checklist items, with pass or fail. Include a screenshot for every failure. Fix the failures, then re-test only the failed cells.
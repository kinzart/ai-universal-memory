// Re-export of the canonical engine. This package's own CLI (bin/aum.js)
// uses this; every target project gets its own vendored copy of the same
// file via `aum init` so memory keeps working without this package
// installed. Single source of truth: templates/engine.mjs.
export { ProjectMemory } from "../templates/engine.mjs";

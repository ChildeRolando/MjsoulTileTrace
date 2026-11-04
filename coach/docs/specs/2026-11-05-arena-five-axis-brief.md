# Five-axis framework and public decision brief

Two optional, independent Arena experiment switches default to off: `fiveAxisFramework` adds the fixed five-axis framework; `structuredBrief` changes direct output to the fixed generic public decision-brief schema and prompt. Both require the same legal candidates and basic facts, with direct tile/red submission and no other experimental modules, teaching, tools, comparison, or explanation. With both switches absent, existing prompts, schemas and scoring remain unchanged.

Fixed source prompt and schema digests are recorded in assembly sources. For transport fidelity, only trailing CR/LF are removed from each fixed prompt before composing the system message; internal characters and line endings are preserved. The old baseline has no trailing CR/LF and is unchanged. The summary is public, not a record of private reasoning.

The structured arm strictly requires the specified schema and a legal final tile/red. The final choice is scored through the same native-candidate path. Duplicate or illegal alternative references are counted in `decisionBriefQuality`; they do not reject an otherwise structurally valid and legal final answer. Prose grounding is marked `not_evaluated` for later review, not mechanically certified. Submission events and recovery retain the public brief and diagnostic counts.

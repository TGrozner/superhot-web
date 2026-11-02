# SH-08 — Defragmentation timeline → level / shop (MCD)

This is a **source-graded, partial contract** for SUPERHOT: MIND CONTROL DELETE, not a recorded Containers gameplay trace. No original assets, decompiled bodies, UI graphics or shaders are copied here.

## PROUVÉ — primary static decompilation, not runtime execution

Provenance: MCD Steam build **20299547**, Unity 2018.4.14f1, `Assembly-CSharp.dll` SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`. Private research **#117**, `corpus-query SUCCESS`, run `41465079445`, artifact `13149219697`, SHA-256 of `result.json` **`fcbfcb3bb81c41819a51cf15cff1fe3ecb72d846adfdcbe2bfa0910acac21704`**. Method and line boundaries refer to private decompiled `managed/Assembly-CSharp/AppDefragmentationMenu.cs:721–920`. The world-runs index (private #17, artifact `13134146422`, SHA-256 `36ff22728515446cf010b4db29aec197377db293fff9b641d4fd97d8cf25628e`) supplied the method pointer, not primary proof of each branch.

`UpdateTimeline:721–724` first disables `AllowReplays` and clears `LoadNextPhase`. The **last-cell** path `:725–799` is separate: endless restart, direct FinishRun or authored SUPERHOT animation depending on flags. The present module **rejects last-cell calls** rather than treating them as ordinary level/shop entries.

With `CheckIfLastCell() == false`, the **Level** path `:800–828` chooses the requested `LastCell` versus `LevelIn` clip using `CurrentRun.CurrentCell == CurrentRun.Cells.Count - 1`, independently of `CheckIfLastCell()`. If `CurrentCell >= 1`, it requests difficulty interpolation. A `SHRLEndlessRun` adds a separate difficulty-variety request. An existing `DefragLoopInstanceId` is faded with the authored argument `5f`. The method requests loading `LevelSetup.GetNextLevelInRun()`, starts the level timer **after requesting the load**, clears the two defrag-activation flags, then requests a screenshot and its display. A clip request is not audible proof; a load request is not completed scene activation.

For a **Shop** cell, `:829–897` skips it if `NoShopsMod` is active, OR if `BlockHacks` holds while `KillAllMod` is inactive. The skip calls `UpdateDefragmentationMenu()` followed by `UpdateCellTravelProperties()`. Otherwise it pauses replay externally *if present* and authors a `timeline.NewPhase().OnEnd(...).EndAfter(0.5f)` callback. The callback does **not** execute in this invocation. Its body subsequently updates disk position, may open `APPUpgradePopup`, waits on `ShopAppClose`, then resumes the flow; this later callback phase is **not implemented** here. `:901–905` supplies the cell-travel update. `FinishRun:908–920` raises OnWin and requests SHMenu in a terminal path, outside this nonterminal helper.

## OBSERVÉ — own Web tests, not MCD

`src/flow/defrag-timeline-intents.js` exports `planMcdDefragNonterminalTimeline`. Inputs require **explicit live run values**, not defaults inferred from the Web three-room prototype. It emits ordered *intents* for level-load requests, timer, sound, screenshot, shop skip and deferred shop callback; it executes none of them. `tests/flow-defrag-timeline-intents.test.mjs` covers level/shop guards, order, short-circuit, independent cell indices, endless-specific rule, replay-pause condition and deferred non-execution. **Local Node 22.16.0: 11/11 focused tests passed**; remote CI must be qualified on the exact PR HEAD. Neither source reading nor Web tests establish native runtime parity.

## INCONNU / refutation requirements

Containers' **actual** `SHRLRun` instance, `CheckIfLastCell`, `CurrentCell`, `Cells.Count`, next LevelInfo, NoShops/BlockHacks/KillAll modifiers, replay object lifetime, callback execution, scheduler timebase, menu display and persistence are **not measured** here. `EndAfter(0.5f)` is authored phase duration, NOT verified wall-clock timing. A scene-specific trace with different guards/order or serialized values would refute application of the planner to that instance. The source's later shop-popup and terminal pathways need separate contracts.

## SH-05 integration boundary

Compose only after source-qualified live state exists: native quota (#85) → ending/replay (#96) → defrag advancement (#117) → this **nonterminal** UpdateTimeline planner. In Level branch require real next LevelInfo; **never substitute index `roomIndex+1`**. In Shop branch use the two proven native skip gates; an eligible popup would need a separately labelled synthetic UI and callback contract. Neither this code nor the other modules justify replacing the Web's invented two-second room timer before live quota/run/scene evidence. SH-05 alone owns `src/main.js`, `index.html`, and `style.css`; no shared-file edits or native media are included.

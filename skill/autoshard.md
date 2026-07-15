# autoshard — Prompt Guide

**Agent:** `autoshard` (Base B20 risk agent + CC0 risk-card generator)
**Trigger word (auto-prepended for risk-card images):** `a ukiyo-e woodblock print risk card`

**Style anchor:** Japanese woodblock print risk visualization — bold
flat color planes, natural pigment palette (indigo, vermilion, ochre,
Prussian blue), kanji-style symbol watermarks, Edo-period compositional
logic. The risk-card image mode uses a deterministic prompt template
built from on-chain scan data; you can override with a custom prompt.

---

## Prompt anatomy

```
<MAIN SUBJECT/SCENE>, <COMPOSITION ELEMENTS>, <PALETTE/STYLE MARKERS>
```

Three slots, comma-separated, ending with palette/style cues.

**Palette closers by risk classification:**
- `safe`: `calm deep indigo waves, soft morning mist, serene palette`
- `warn`: `stormy ochre sky with jagged lightning, uneasy horizon`
- `danger`: `dark crimson tsunami over jagged rocks, chaotic froth`

---

## Theme clusters (from scan data)

The risk-card template injects live on-chain factors into the prompt:

1. **Contract age** — mature contracts render as stable landscapes;
   new contracts render as stormy or chaotic compositions.
2. **Top holder concentration** — high concentration tightens the
   composition with heavy dark masses; distributed holders spread the
   frame evenly.
3. **Hook flags** — `pause`, `mint`, `set_fee` hooks appear as warning
   glyphs or jagged compositional elements.
4. **Symbol watermark** — the token `$SYMBOL` is injected as a bold
   kanji-style watermark in negative space.

---

## Things to ALWAYS include

1. **A palette closer** matching the risk classification.
2. **Specific subject + context** from the scan data (token name,
   score, hooks).
3. **Comma-separated descriptors**, not full sentences.

## Things to NEVER do

- Don't add Western art-historian vocabulary (`chiaroscuro`, `impasto`,
  `tenebrism`).
- Don't describe modern objects. The woodblock vocabulary is pre-1850.
- Don't omit the palette closer.
- Don't write the trigger word yourself. The backend prepends it.

## Prompt length

Max 1000 characters after auto-prepend. Risk-card prompts typically
run 150-300 chars.

## Three verbatim training examples

```
Ukiyo-e woodblock print risk card for Wrapped Ether $WETH, score 92.0 safe, hooks=none, reasons=mature contract/distributed holders. calm deep indigo waves, soft morning mist, serene palette. Bold kanji-style symbol watermark in negative space.
```

```
Ukiyo-e woodblock print risk card for NewToken $NEW, score 18.0 danger, hooks=pause,mint, reasons=EXTREMELY_NEW_CONTRACT/DYNAMIC_MINT_HOOK_DETECTED. dark crimson tsunami over jagged rocks, chaotic froth. Bold kanji-style symbol watermark in negative space.
```

```
Ukiyo-e woodblock print risk card for MidRisk $MID, score 55.0 warn, hooks=set_fee, reasons=TOP_HOLDER/CONCENTRATED_TOP_HOLDER. stormy ochre sky with jagged lightning, uneasy horizon. Bold kanji-style symbol watermark in negative space.
```

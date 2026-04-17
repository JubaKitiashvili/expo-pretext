# Regression detection

expo-pretext ships two complementary regression nets. One runs in CI on
every PR; the other runs on-device when you want to validate a specific
build.

## 1. CI height snapshot

[`scripts/snapshot.ts`](../scripts/snapshot.ts) walks a curated corpus
(14 texts × 3 styles × 5 widths = 210 entries) through `prepare()` +
`layout()` and writes a deterministic JSON baseline to
[`docs/snapshots/baseline.json`](./snapshots/baseline.json).

Every CI run regenerates that snapshot and compares against the committed
baseline. Any drift — height or line-count — fails the job.

### Usage

```sh
bun run snapshot            # check against baseline (exits 1 on drift)
bun run snapshot:update     # rewrite baseline after intentional changes
```

When a PR intentionally changes the layout engine (a line-break tweak, a
width-measurement refactor, etc.), run `bun run snapshot:update`, verify
the diff is the one you expected, and commit the updated baseline. CI
then goes green again.

### Coverage

- **Scripts** — English, Arabic, Chinese, Japanese, Georgian, Thai, emoji,
  mixed-script
- **Edge cases** — empty, single word, many newlines, whitespace-only,
  RTL + LTR mix
- **Style variants** — `16/24`, `14/20`, `20/30`
- **Widths** — 160, 240, 320, 420, 640

The snapshot measures the **JS-fallback path** (no native backend, no
device). That's the right layer for CI — it runs in milliseconds on a
stock Ubuntu runner and catches any engine-level regression.

## 2. On-device accuracy check (Tools tab)

The example app's **Tools** tab runs a live comparison between the
native path (iOS TextKit / Android TextPaint / Web Canvas) and what
`<Text onLayout>` actually reports. Each row shows `predicted`, `RN Text`,
and a `PASS` / `FAIL` verdict with a 2 px tolerance.

This is the right layer for validating a release build on a real device:
CI can't run the native backend, so on-device is where you confirm
TextKit+Pretext stay in agreement.

Both nets are expected to be green before a release tag.

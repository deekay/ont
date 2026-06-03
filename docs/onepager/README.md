# ONT one-pager (print / PDF)

A two-page, print-formatted rendering of [`../ONT_ONE_PAGER.md`](../ONT_ONE_PAGER.md),
with diagrams, for sharing as a PDF.

| File | What |
| --- | --- |
| `onepager.html` | Source — self-contained (Helvetica font stack so the ₿ glyph renders). |
| `ONT_one-pager.pdf` | Rendered two-page output. |
| `render.sh` | Regenerate the PDF from the HTML via headless Chrome. |

Regenerate after editing the HTML:

```sh
./render.sh
```

The Markdown one-pager (`../ONT_ONE_PAGER.md`) is the canonical text; this is its
print/visual rendering and should be kept in step with it.

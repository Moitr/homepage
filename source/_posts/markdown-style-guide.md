---
title: Markdown Style Guide
date: 2026-08-10 12:00:00
categories:
  - Notes
tags:
  - Markdown
  - Design
  - Writing
---

Markdown turns plain text into clear, structured writing. This article is a visual reference for every common element used across the site.

<!-- more -->

## Typography

Good writing begins with a readable rhythm. Markdown supports **bold text**, *italic text*, ***bold italic text***, and ~~strikethrough text~~. Use `inline code` for commands, file names, and short technical references.

You can also create [descriptive links](https://hexo.io/docs/), write a literal \*asterisk\*, or show a keyboard shortcut such as <kbd>Ctrl</kbd> + <kbd>K</kbd>.

## Headings

Headings give a long article a clear hierarchy. The article title is the first-level heading, so the content normally begins at level two.

### A third-level heading

Use third-level headings to divide a larger section into focused ideas.

#### A fourth-level heading

Avoid going deeper unless the subject genuinely needs it.

## Blockquotes

> Design is not only what something looks like. It is also how clearly it communicates, how naturally it responds, and how quietly it gets out of the way.

> A longer quotation can span multiple lines.
>
> Separate paragraphs remain part of the same quotation when each one keeps the quote marker.

## Lists

An unordered list works well when sequence does not matter:

- Write with a clear purpose.
- Keep each idea focused.
- Remove anything that does not help the reader.

An ordered list is useful for a process:

1. Draft the idea.
2. Review the structure.
3. Refine the language.
4. Publish with confidence.

A task list makes progress visible:

- [x] Create the first draft
- [x] Check typography and spacing
- [ ] Replace the sample content

## Table

| Element | Best used for | Markdown syntax |
| :--- | :--- | :---: |
| Bold | Strong emphasis | `**text**` |
| Italic | Gentle emphasis | `*text*` |
| Link | Further reading | `[label](url)` |
| Code | Technical details | `` `code` `` |

## Code

Fenced code blocks include syntax highlighting and horizontal scrolling for long lines.

```javascript
const articles = [
  { title: 'A quiet beginning', published: true },
  { title: 'Work in progress', published: false }
];

const publishedTitles = articles
  .filter((article) => article.published)
  .map((article) => article.title);

console.log(publishedTitles);
```

```css
:root {
  --background: #ffffff;
  --text: #151515;
  --accent: #2563eb;
}

.article-title {
  color: var(--text);
  font-weight: 700;
  line-height: 1.15;
}
```

```bash
pnpm install
pnpm build
pnpm server
```

## Image

![A laptop displaying source code on a desk](https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1600&q=85)

*Images should support the story, remain legible, and include useful alternative text.*

## Expandable Details

<details>
  <summary>Open this section</summary>

  This content stays hidden until the reader chooses to reveal it. It is useful for optional notes, answers, or implementation details.
</details>

---

## Final Note

The best Markdown is simple enough to read as plain text and structured enough to become a thoughtful page. Start with meaning, then use formatting to make that meaning easier to follow.

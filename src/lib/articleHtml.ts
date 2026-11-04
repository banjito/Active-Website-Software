import DOMPurify from "dompurify";

/**
 * Article body HTML is shown on ampqes.com, which keeps only these tags and
 * attributes. Cleaning the same way before saving means what the writer sees
 * in ampOS is what the public site renders. Keep in step with the site's
 * allowlist (it unwraps anything else and strips all other attributes).
 */
export const ARTICLE_ALLOWED_TAGS = [
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "a",
  "img",
  "blockquote",
  "figure",
  "figcaption",
  "hr",
];

const ARTICLE_ALLOWED_ATTR = ["href", "src", "alt"];

// http(s), mailto, tel and relative links only.
const SAFE_URI = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "UL",
  "OL",
  "LI",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "FIGURE",
  "HR",
  "TABLE",
]);

/**
 * Browsers sometimes write <div> for a new line. Turn a div with no block
 * children into a <p> so it keeps its own line on the site; unwrap the rest.
 */
function divsToParagraphs(root: HTMLElement) {
  const divs = Array.from(root.querySelectorAll("div")).reverse();
  for (const div of divs) {
    const hasBlockChild = Array.from(div.children).some((c) =>
      BLOCK_TAGS.has(c.tagName),
    );
    if (hasBlockChild) {
      div.replaceWith(...Array.from(div.childNodes));
    } else {
      const p = document.createElement("p");
      p.append(...Array.from(div.childNodes));
      div.replaceWith(p);
    }
  }
  // H1 is the page title on the site, so body headings start at H2.
  for (const h1 of Array.from(root.querySelectorAll("h1"))) {
    const h2 = document.createElement("h2");
    h2.append(...Array.from(h1.childNodes));
    h1.replaceWith(h2);
  }
}

/** Clean article body HTML to the ampqes.com allowlist. */
export function sanitizeArticleHtml(html: string): string {
  if (!html) return "";
  const container = document.createElement("div");
  container.innerHTML = DOMPurify.sanitize(html);
  divsToParagraphs(container);
  const clean = DOMPurify.sanitize(container.innerHTML, {
    ALLOWED_TAGS: ARTICLE_ALLOWED_TAGS,
    ALLOWED_ATTR: ARTICLE_ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: SAFE_URI,
    KEEP_CONTENT: true,
  });
  // Drop empty paragraphs left at the very end by the editor.
  return clean.replace(/(<p>(\s|&nbsp;|<br>)*<\/p>\s*)+$/i, "").trim();
}

/** Plain text of the body, for "is it empty" checks. */
export function articleBodyText(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = DOMPurify.sanitize(html || "");
  return (el.textContent || "").replace(/ /g, " ").trim();
}

/** "Hello, World!" -> "hello-world". Matches the database slug rule. */
export function slugify(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

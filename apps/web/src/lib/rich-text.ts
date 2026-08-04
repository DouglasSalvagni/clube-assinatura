const ALLOWED_TAGS = new Set([
  'A',
  'B',
  'BLOCKQUOTE',
  'BR',
  'DIV',
  'EM',
  'H1',
  'H2',
  'H3',
  'H4',
  'I',
  'LI',
  'OL',
  'P',
  'S',
  'SPAN',
  'STRONG',
  'U',
  'UL',
]);

const BLOCKED_TAGS = new Set([
  'EMBED',
  'IFRAME',
  'MATH',
  'OBJECT',
  'SCRIPT',
  'STYLE',
  'SVG',
  'TEMPLATE',
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function looksLikeRichText(value: string) {
  return /<\/?(?:p|div|h[1-4]|strong|b|em|i|u|s|ul|ol|li|blockquote|a|br|span)\b/i.test(value);
}

export function plainTextToRichText(value: string) {
  const normalized = value.replace(/\r\n?/g, '\n');
  if (!normalized.trim()) return '<p><br></p>';

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const content = paragraph
        .split('\n')
        .map((line) => escapeHtml(line))
        .join('<br>');
      return `<p>${content || '<br>'}</p>`;
    })
    .join('');
}

export function normalizeRichText(value: string) {
  return looksLikeRichText(value) ? value : plainTextToRichText(value);
}

function isSafeHref(value: string) {
  const trimmed = value.trim();
  return /^(https?:|mailto:|tel:|#|\/(?!\/))/i.test(trimmed);
}

export function sanitizeRichText(value: string) {
  const normalized = normalizeRichText(value);

  if (typeof document === 'undefined') {
    return normalized;
  }

  const template = document.createElement('template');
  template.innerHTML = normalized;

  const clean = (parent: ParentNode) => {
    Array.from(parent.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) return;

      if (node.nodeType !== Node.ELEMENT_NODE) {
        node.parentNode?.removeChild(node);
        return;
      }

      const element = node as HTMLElement;
      const tag = element.tagName.toUpperCase();

      if (BLOCKED_TAGS.has(tag)) {
        element.remove();
        return;
      }

      clean(element);

      if (!ALLOWED_TAGS.has(tag)) {
        element.replaceWith(...Array.from(element.childNodes));
        return;
      }

      const href = tag === 'A' ? element.getAttribute('href') : null;
      const textAlign = element.style.textAlign || element.getAttribute('align') || '';
      Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));

      if (tag === 'A' && href && isSafeHref(href)) {
        element.setAttribute('href', href);
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }

      if (['left', 'center', 'right', 'justify'].includes(textAlign)) {
        element.style.textAlign = textAlign;
      }
    });
  };

  clean(template.content);
  return template.innerHTML || '<p><br></p>';
}

export function richTextToPlainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-4]|li|blockquote)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hasRichTextContent(value: string) {
  return richTextToPlainText(value).length > 0;
}

'use client';

import { useEffect, useState } from 'react';
import {
  looksLikeRichText,
  plainTextToRichText,
  sanitizeRichText,
} from '@/lib/rich-text';

type SafeRichTextProps = {
  content: string;
  className?: string;
};

export default function SafeRichText({ content, className = '' }: SafeRichTextProps) {
  const [safeHtml, setSafeHtml] = useState(() => (
    looksLikeRichText(content) ? '' : plainTextToRichText(content)
  ));

  useEffect(() => {
    setSafeHtml(sanitizeRichText(content));
  }, [content]);

  return (
    <div
      className={`rich-text-content ${className}`}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}

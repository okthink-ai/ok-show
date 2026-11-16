import { isValidElement } from 'react';
import type { SlideData } from '../types/slide.types';

export interface TextElement {
  text: string;
  propPath: string;
  role: 'label' | 'title' | 'subtitle' | 'body' | 'value' | 'caption' | 'meta';
}

export interface SlideTextContent {
  template: string;
  elements: TextElement[];
}

export function extractSlideText(slide: SlideData): SlideTextContent | null {
  if (!isValidElement(slide.content)) return null;
  const props = slide.content.props as Record<string, unknown>;
  const template = slide.template || 'Unknown';
  const elements: TextElement[] = [];

  // Common fields across most templates
  if (typeof props.label === 'string') elements.push({ text: props.label, propPath: 'label', role: 'label' });
  if (typeof props.title === 'string') elements.push({ text: props.title, propPath: 'title', role: 'title' });

  // Subtitle: string or string[]
  if (typeof props.subtitle === 'string') {
    elements.push({ text: props.subtitle, propPath: 'subtitle', role: 'subtitle' });
  } else if (Array.isArray(props.subtitle)) {
    props.subtitle.forEach((s: string, i: number) =>
      elements.push({ text: s, propPath: `subtitle[${i}]`, role: 'subtitle' })
    );
  }

  // Template-specific extraction
  switch (template) {
    case 'TitleSlide':
      if (typeof props.brandName === 'string') elements.push({ text: props.brandName, propPath: 'brandName', role: 'meta' });
      if (typeof props.company === 'string') elements.push({ text: props.company, propPath: 'company', role: 'meta' });
      if (typeof props.date === 'string') elements.push({ text: props.date, propPath: 'date', role: 'meta' });
      if (Array.isArray(props.founderDetails)) {
        (props.founderDetails as Array<{ name: string; email: string }>).forEach((f, i) => {
          elements.push({ text: f.name, propPath: `founderDetails[${i}].name`, role: 'caption' });
          elements.push({ text: f.email, propPath: `founderDetails[${i}].email`, role: 'meta' });
        });
      }
      break;

    case 'BulletSlide':
      if (Array.isArray(props.items)) {
        (props.items as string[]).forEach((item, i) =>
          elements.push({ text: item, propPath: `items[${i}]`, role: 'body' })
        );
      }
      break;

    case 'FiguresSlide':
      if (Array.isArray(props.dataPoints)) {
        (props.dataPoints as Array<{ label: string; value: string; description?: string }>).forEach((dp, i) => {
          elements.push({ text: dp.value, propPath: `dataPoints[${i}].value`, role: 'value' });
          elements.push({ text: dp.label, propPath: `dataPoints[${i}].label`, role: 'caption' });
          if (dp.description) elements.push({ text: dp.description, propPath: `dataPoints[${i}].description`, role: 'body' });
        });
      }
      break;

    case 'ThreePanelSlide':
    case 'FourPanelSlide':
      if (Array.isArray(props.panels)) {
        (props.panels as Array<{ title: string; subtitle?: string; description?: string }>).forEach((p, i) => {
          elements.push({ text: p.title, propPath: `panels[${i}].title`, role: 'caption' });
          if (p.subtitle) elements.push({ text: p.subtitle, propPath: `panels[${i}].subtitle`, role: 'body' });
          if (p.description) elements.push({ text: p.description, propPath: `panels[${i}].description`, role: 'body' });
        });
      }
      break;

    case 'TeamSlide':
      if (Array.isArray(props.members)) {
        (props.members as Array<{ name: string; title: string }>).forEach((m, i) => {
          elements.push({ text: m.name, propPath: `members[${i}].name`, role: 'caption' });
          elements.push({ text: m.title, propPath: `members[${i}].title`, role: 'meta' });
        });
      }
      break;

    case 'TableSlide':
      if (Array.isArray(props.columns)) {
        (props.columns as Array<{ header: string }>).forEach((c, i) =>
          elements.push({ text: c.header, propPath: `columns[${i}].header`, role: 'caption' })
        );
      }
      if (Array.isArray(props.rows)) {
        (props.rows as Array<{ label: string; values: string[] }>).forEach((r, i) => {
          elements.push({ text: r.label, propPath: `rows[${i}].label`, role: 'caption' });
          r.values.forEach((v, j) =>
            elements.push({ text: v, propPath: `rows[${i}].values[${j}]`, role: 'body' })
          );
        });
      }
      break;

    case 'SectionsSlide':
      if (Array.isArray(props.sections)) {
        (props.sections as Array<{ title: string; description: string }>).forEach((s, i) => {
          elements.push({ text: s.title, propPath: `sections[${i}].title`, role: 'caption' });
          elements.push({ text: s.description, propPath: `sections[${i}].description`, role: 'body' });
        });
      }
      break;

    case 'TextWithMediaSlide':
      if (typeof props.content === 'string') {
        elements.push({ text: props.content, propPath: 'content', role: 'body' });
      } else if (Array.isArray(props.content)) {
        (props.content as string[]).forEach((c, i) =>
          elements.push({ text: c, propPath: `content[${i}]`, role: 'body' })
        );
      }
      break;

    case 'TableOfContentsSlide':
      if (Array.isArray(props.items)) {
        (props.items as Array<{ number: number; title: string }>).forEach((item, i) =>
          elements.push({ text: item.title, propPath: `items[${i}].title`, role: 'body' })
        );
      }
      if (typeof props.description === 'string') {
        elements.push({ text: props.description, propPath: 'description', role: 'body' });
      }
      break;

    case 'StatementSlide':
      // label, title, and subtitle are already extracted above via common fields
      break;

    case 'FourImageSlide':
      // label, title, and subtitle are already extracted above via common fields
      if (Array.isArray(props.imageAlts)) {
        (props.imageAlts as string[]).forEach((alt, i) =>
          elements.push({ text: alt, propPath: `imageAlts[${i}]`, role: 'caption' })
        );
      }
      break;

    default: {
      // Generic fallback: extract all top-level string props for unknown templates.
      // This ensures new templates get basic outline support without requiring a new case.
      const knownCommonProps = new Set(['label', 'title', 'subtitle', 'orientation']);
      for (const [key, value] of Object.entries(props)) {
        if (typeof value === 'string' && !knownCommonProps.has(key)) {
          elements.push({ text: value, propPath: key, role: 'body' });
        }
      }
      break;
    }
  }

  return { template, elements };
}

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:ok-vibe-slides/project', () => ({
  presentationsDir: 'decks',
  engineDir: 'node_modules/ok-vibe-slides/',
  templateStylesheets: { QuoteSlide: 'templates/QuoteSlide.css', BulletSlide: 'templates/BulletSlide.css', WideBulletSlide: 'templates/WideBulletSlide.css' },
}));

describe('slide registry in a project that installs the engine', () => {
  beforeEach(() => vi.resetModules());

  it('derives class fragments from component names', async () => {
    const { templateClassFragment } = await import('./slideRegistry');
    expect(templateClassFragment('EightPanelSlide')).toBe('eight-panel-slide');
    expect(templateClassFragment('QuoteSlide')).toBe('quote-slide');
  });

  it('attributes project templates to project stylesheets and engine templates to the package', async () => {
    const { componentFileMap, getComponentName } = await import('./slideRegistry');
    expect(getComponentName('quote-slide__quote')).toBe('QuoteSlide');
    expect(componentFileMap.QuoteSlide).toBe('templates/QuoteSlide.css');
    expect(componentFileMap.TeamSlide).toBe('node_modules/ok-vibe-slides/src/components/slides/TeamSlide.css');
    expect(componentFileMap['Slide container']).toBe('node_modules/ok-vibe-slides/src/components/Slide.css');
  });

  it('lets a project template override an engine template of the same name', async () => {
    const { componentFileMap, getComponentName } = await import('./slideRegistry');
    expect(componentFileMap.BulletSlide).toBe('templates/BulletSlide.css');
    expect(getComponentName('wide-bullet-slide__item')).toBe('WideBulletSlide');
    expect(getComponentName('bullet-slide__item')).toBe('BulletSlide');
  });
});

describe('built-in template registry', () => {
  beforeEach(() => vi.resetModules());

  it('matches whole BEM class names, not substrings', async () => {
    const { getComponentName } = await import('./slideRegistry');
    expect(getComponentName('three-panel-slide__panel-icon material-icons')).toBe('ThreePanelSlide');
    expect(getComponentName('video-slide video-slide--landscape')).toBe('VideoSlide');
    expect(getComponentName('my-title-slide-banner')).toBe('Unknown');
    expect(getComponentName({} as unknown as string)).toBe('Unknown');
  });

  it('lists every built-in template, each rendering its root class', async () => {
    const { SLIDE_TYPES, templateClassFragment } = await import('./slideRegistry');
    const slidesDir = join(process.cwd(), 'src/components/slides');
    const templates = readdirSync(slidesDir)
      .filter(file => file.endsWith('Slide.tsx') && !file.includes('.test.'))
      .map(file => file.slice(0, -'.tsx'.length))
      .sort();
    expect(SLIDE_TYPES.map(type => type.componentName).sort()).toEqual(templates);
    for (const { componentName, classFragment } of SLIDE_TYPES) {
      if (componentName !== 'TableOfContentsSlide') expect(classFragment).toBe(templateClassFragment(componentName));
      const source = readFileSync(join(slidesDir, `${componentName}.tsx`), 'utf8');
      expect(source, `${componentName} root class`).toMatch(new RegExp(`className=["\`]${classFragment}[ "\`]`));
    }
  });
});

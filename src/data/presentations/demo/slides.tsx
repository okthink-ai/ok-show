import type { SlideData } from '../../../types/slide.types';
import TitleSlide from '../../../components/slides/TitleSlide';
import TableOfContentsSlide from '../../../components/slides/TableOfContentsSlide';
import BulletSlide from '../../../components/slides/BulletSlide';
import StatementSlide from '../../../components/slides/StatementSlide';
import ThreePanelSlide from '../../../components/slides/ThreePanelSlide';
import FourPanelSlide from '../../../components/slides/FourPanelSlide';
import FourImageSlide from '../../../components/slides/FourImageSlide';
import TextWithMediaSlide from '../../../components/slides/TextWithMediaSlide';
import TeamSlide from '../../../components/slides/TeamSlide';
import TableSlide from '../../../components/slides/TableSlide';
import FiguresSlide from '../../../components/slides/FiguresSlide';
import SectionsSlide from '../../../components/slides/SectionsSlide';
import VideoSlide from '../../../components/slides/VideoSlide';

export const slides: SlideData[] = [
  {
    id: 'demo-title',
    title: 'Title Slide',
    template: 'TitleSlide',
    content: (
      <TitleSlide
        title="ok-vibe-slides Demo"
        subtitle="A Presentation Engine"
        brandName="ok-vibe-slides"
        company="Demo Company"
        date="May 2025"
        founderDetails={[
          { name: 'Jane Doe', email: 'jane@example.com' },
          { name: 'John Smith', email: 'john@example.com' },
        ]}
      />
    ),
  },
  {
    id: 'demo-toc',
    title: 'Table of Contents',
    template: 'TableOfContentsSlide',
    content: (
      <TableOfContentsSlide
        title="Agenda"
        subtitle="What We'll Cover"
        description="An overview of all available slide templates in this presentation engine."
        items={[
          { number: '01', title: 'Slide Templates' },
          { number: '02', title: 'Content Layouts' },
          { number: '03', title: 'Data Visualization' },
          { number: '04', title: 'Media Support' },
          { number: '05', title: 'Team Profiles' },
        ]}
      />
    ),
  },
  {
    id: 'demo-bullet',
    title: 'Bullet Slide',
    template: 'BulletSlide',
    content: (
      <BulletSlide
        label="Features"
        title="Key Capabilities"
        items={[
          'Dual aspect ratio support — 16:9 desktop and 9:16 mobile',
          'Keyboard and touch navigation with smooth transitions',
          'Built-in annotation system for collaborative review',
          'Inspector mode for debugging layout and component props',
          'PDF export with presentation-specific routing',
        ]}
      />
    ),
  },
  {
    id: 'demo-statement',
    title: 'Statement Slide',
    template: 'StatementSlide',
    content: (
      <StatementSlide
        label="Vision"
        title="Presentations should be built with code, not dragged around in a GUI."
        subtitle="ok-vibe-slides gives you the power of React components with the polish of a design tool."
        titleSize="compact"
        cta={<a className="statement-slide__cta" href="/export">Export this deck to PDF</a>}
        footer={<span>ok-vibe-slides demo</span>}
      />
    ),
  },
  {
    id: 'demo-three-panel',
    title: 'Three Panel Slide',
    template: 'ThreePanelSlide',
    content: (
      <ThreePanelSlide
        label="Approach"
        title="Three Pillars"
        panels={[
          {
            icon: 'palette',
            color: 'var(--color-brand-teal)',
            title: 'Design System',
            subtitle: 'Consistent tokens',
            description: 'Typography scale, color palette, spacing, and shadows — all defined as CSS custom properties for easy theming.',
          },
          {
            icon: 'widgets',
            color: 'var(--color-brand-purple)',
            title: 'Component Library',
            subtitle: '13 templates',
            description: 'Every common slide layout is a reusable React component with typed props and responsive orientation support.',
          },
          {
            icon: 'code',
            color: 'var(--color-brand-orange)',
            title: 'Developer Experience',
            subtitle: 'Code-first workflow',
            description: 'Write slides in TSX, preview with hot reload, annotate in the browser, and export to PDF when ready.',
          },
        ]}
      />
    ),
  },
  {
    id: 'demo-four-panel',
    title: 'Four Panel Slide',
    template: 'FourPanelSlide',
    content: (
      <FourPanelSlide
        label="Details"
        title="Feature Overview"
        panels={[
          {
            title: 'Navigation',
            description: 'Arrow keys, swipe gestures, URL deep links, and presentation switcher sidebar.',
          },
          {
            title: 'Annotations',
            description: 'Alt+click any element to annotate. Copy summaries for AI agent collaboration.',
          },
          {
            title: 'Inspector',
            description: 'Hold Alt to hover-inspect. See component names, dimensions, and flex properties.',
          },
          {
            title: 'Export',
            description: 'Route-based PDF export renders all slides at full resolution for printing.',
          },
        ]}
      />
    ),
  },
  {
    id: 'demo-four-image',
    title: 'Four Image Slide',
    template: 'FourImageSlide',
    content: (
      <FourImageSlide
        label="Gallery"
        title="Image Grid"
        images={[
          '/placeholder-image.svg',
          '/placeholder-image.svg',
          '/placeholder-image.svg',
          '/placeholder-image.svg',
        ]}
        imageAlts={['Placeholder 1', 'Placeholder 2', 'Placeholder 3', 'Placeholder 4']}
        description="An optional description sits under the grid."
      />
    ),
  },
  {
    id: 'demo-text-media',
    title: 'Text with Media Slide',
    template: 'TextWithMediaSlide',
    content: (
      <TextWithMediaSlide
        label="Layout"
        title="Text with Media"
        content={[
          'This template places text content alongside an image or media element.',
          'Pass a string or array of strings for the content prop.',
          'The image is optional — when absent, the text fills the full width.',
        ]}
        imageUrl="/placeholder-image.svg"
        imageAlt="Placeholder illustration"
      />
    ),
  },
  {
    id: 'demo-team',
    title: 'Team Slide',
    template: 'TeamSlide',
    content: (
      <TeamSlide
        label="Team"
        title="Meet the Team"
        subtitle="The people behind the project"
        members={[
          {
            name: 'Jane Doe',
            title: 'CEO & Co-Founder',
            imageUrl: '/placeholder-avatar.svg',
            landscapeImageUrl: '/placeholder-avatar.svg',
          },
          {
            name: 'John Smith',
            title: 'CTO & Co-Founder',
            imageUrl: '/placeholder-avatar.svg',
            landscapeImageUrl: '/placeholder-avatar.svg',
          },
        ]}
      />
    ),
  },
  {
    id: 'demo-table',
    title: 'Table Slide',
    template: 'TableSlide',
    content: (
      <TableSlide
        label="Comparison"
        title="Feature Matrix"
        subtitle="How ok-vibe-slides compares"
        columns={[
          { header: 'Feature' },
          { header: 'ok-vibe-slides', highlight: true },
          { header: 'Slides SaaS' },
          { header: 'PowerPoint' },
        ]}
        rows={[
          { label: 'Code-first', values: ['Yes', 'No', 'No'] },
          { label: 'React Components', values: ['Yes', 'No', 'No'] },
          { label: 'Annotations', values: ['Built-in', 'Plugin', 'Built-in'] },
          { label: 'PDF Export', values: ['Yes', 'Yes', 'Yes'] },
          { label: 'Mobile Layout', values: ['9:16 native', 'Responsive', 'No'] },
        ]}
      />
    ),
  },
  {
    id: 'demo-figures',
    title: 'Figures Slide',
    template: 'FiguresSlide',
    content: (
      <FiguresSlide
        label="Metrics"
        title="By the Numbers"
        subtitle="What ships in the package"
        dataPoints={[
          { label: 'Slide Templates', value: '13', description: 'Reusable components for every common layout' },
          { label: 'CSS Variables', value: '60+', description: 'Design tokens for typography, color, and spacing' },
          { label: 'Bundle Size', value: '<200KB', description: 'Lightweight engine with zero heavy dependencies' },
          { label: 'Aspect Ratios', value: '2', description: 'Desktop 16:9 and mobile 9:16 with auto-scaling' },
        ]}
      />
    ),
  },
  {
    id: 'demo-sections',
    title: 'Sections Slide',
    template: 'SectionsSlide',
    content: (
      <SectionsSlide
        label="Architecture"
        title="Project Structure"
        sections={[
          { title: 'Components', description: 'Slide templates, navigation chrome, annotation UI, and inspector panels.' },
          { title: 'Hooks', description: 'Keyboard navigation, fullscreen sync, URL state, inspector mode, and responsive layout.' },
          { title: 'State Management', description: 'Redux Toolkit slices for presentations, annotations, and UI state.' },
          { title: 'Design System', description: 'CSS custom properties for colors, typography, spacing, shadows, and gradients.' },
        ]}
      />
    ),
  },
  {
    id: 'demo-video',
    title: 'Video Slide',
    template: 'VideoSlide',
    content: (
      <VideoSlide
        label="Media"
        title="Video Playback"
        videoUrl="https://example.com/demo.mp4"
        description={<>This template supports embedded video with a play button overlay. A description appears under the player, which keeps the video at 16:9.</>}
      />
    ),
  },
];

import { defineConfig } from 'ok-show/config';

// Non-default folders, so the tests prove every path comes from this file.
export default defineConfig({
  title: 'Fixture Talks',
  presentationsDir: 'decks',
  templatesDir: 'templates',
  outDir: 'build',
  styles: ['styles/brand.css'],
  head: '<meta name="fixture-head" content="from-config">\n<meta name="description" content="Fixture description">',
});

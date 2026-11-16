import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const APP_URL = 'http://127.0.0.1:5198';
const VIDEO_PATH = 'docs/assets/ok-vibe-slides-demo.mp4';
const execFileAsync = promisify(execFile);

test('record the user-facing feature tour', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: 'test-results/demo-video', size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  const video = page.video();

  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          * { box-sizing: border-box; }
          html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #09090b; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
          .stage { position: relative; width: 100%; height: 100%; background: #09090b; }
          .panel { position: absolute; top: 0; bottom: 0; width: 100%; height: 100%; border: 0; transition: width 700ms cubic-bezier(.2,.8,.2,1), left 700ms cubic-bezier(.2,.8,.2,1), opacity 500ms ease; }
          #presentation { left: 0; width: 100%; z-index: 2; }
          #notes { left: 62%; width: 38%; z-index: 1; opacity: 0; border-left: 2px solid rgba(255,255,255,.12); }
          .stage.split #presentation { width: 62%; }
          .stage.split #notes { opacity: 1; z-index: 3; }
          .label { position: absolute; z-index: 10; top: 28px; padding: 10px 16px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; color: rgba(255,255,255,.8); background: rgba(9,9,11,.82); backdrop-filter: blur(16px); font-size: 15px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; opacity: 0; transition: opacity 400ms ease; }
          .stage.split .label { opacity: 1; }
          .label.presenter { left: 28px; }
          .label.notes { top: auto; right: 28px; bottom: 28px; }
          .caption { position: absolute; z-index: 20; left: 50%; bottom: 32px; width: min(1120px, calc(100% - 80px)); transform: translateX(-50%); padding: 22px 34px; border: 1px solid rgba(255,255,255,.18); border-radius: 20px; background: rgba(9,9,11,.88); box-shadow: 0 24px 80px rgba(0,0,0,.4); color: white; text-align: center; font-size: 28px; font-weight: 650; letter-spacing: -.02em; backdrop-filter: blur(18px); transition: opacity 200ms ease, transform 200ms ease; }
          .caption.swap { opacity: 0; transform: translate(-50%, 10px); }
        </style>
      </head>
      <body>
        <main class="stage" id="stage">
          <iframe class="panel" id="presentation" name="presentation" title="Presentation" src="${APP_URL}/?presentation=demo&slide=1&session=feature-demo&token=test-token"></iframe>
          <iframe class="panel" id="notes" name="notes" title="Speaker notes" src="${APP_URL}/notes?session=feature-demo&token=test-token"></iframe>
          <div class="label presenter">Audience view</div>
          <div class="label notes">Presenter view</div>
          <div class="caption" id="caption">A code-first presentation engine, now with complete visual themes.</div>
        </main>
      </body>
    </html>
  `);

  const presentation = page.frame({ name: 'presentation' });
  const notes = page.frame({ name: 'notes' });
  if (!presentation || !notes) throw new Error('Demo frames did not load');

  const pause = (milliseconds = 1_500) => page.waitForTimeout(milliseconds);
  const caption = async (text: string) => {
    await page.locator('#caption').evaluate((element) => element.classList.add('swap'));
    await page.waitForTimeout(220);
    await page.locator('#caption').evaluate((element, next) => { element.textContent = next; }, text);
    await page.locator('#caption').evaluate((element) => element.classList.remove('swap'));
  };

  await expect(presentation.locator('.app')).toBeVisible();
  await expect(presentation.locator('.footer__sync')).toHaveClass(/--connected/);
  await expect(notes.locator('.speaker-notes__status')).toHaveAttribute('aria-label', 'connected');
  await pause(1_800);

  const developerTools = presentation.getByRole('button', { name: 'Toggle developer tools' });
  await developerTools.click();
  await presentation.getByRole('button', { name: 'Palette' }).click();
  await caption('Choose from six coordinated themes—colors, typography, and surfaces update together.');
  await pause();
  await presentation.getByTestId('theme-option-paper').click();
  await expect(presentation.locator('html')).toHaveAttribute('data-theme', 'paper');
  await pause(1_300);
  await presentation.getByTestId('theme-option-ember').click();
  await expect(presentation.locator('html')).toHaveAttribute('data-theme', 'ember');
  await pause(1_300);
  await presentation.getByTestId('theme-option-ocean').click();
  await expect(presentation.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await pause(1_500);
  await developerTools.click();
  await pause(700);

  await page.locator('#stage').evaluate((element) => element.classList.add('split'));
  await caption('A protected speaker-notes view stays synchronized with the audience presentation.');
  await pause(2_200);

  const slideCount = notes.locator('.speaker-notes__slide-count');
  const notesNext = notes.getByRole('button', { name: 'Next slide', exact: true });
  await notesNext.click();
  await expect(slideCount).toHaveText(/^2 out of 13$/);
  await caption('Navigate from the presenter controls…');
  await pause(1_600);

  await presentation.locator('body').press('ArrowRight');
  await expect(slideCount).toHaveText(/^3 out of 13$/);
  await caption('…or from the audience view. Both sides stay on the same slide.');
  await pause(1_800);

  const increaseReadingSize = notes.getByRole('button', { name: 'Increase reading size' });
  await increaseReadingSize.click();
  await increaseReadingSize.click();
  await caption('Presenter notes include current and next previews plus adjustable reading size.');
  await pause(2_000);

  await notesNext.click();
  await expect(slideCount).toHaveText(/^4 out of 13$/);
  await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('4');
  await notesNext.click();
  await expect(slideCount).toHaveText(/^5 out of 13$/);
  await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('5');
  await caption('Sessions persist navigation state and recover cleanly after a refresh.');
  await pause(1_500);
  await notes.goto(notes.url());
  await expect(slideCount).toHaveText(/^5 out of 13$/);
  await pause(2_000);

  await caption('Synchronized. Themeable. Presenter-ready.');
  await pause(2_500);

  await context.close();
  if (!video) throw new Error('Playwright video was not available');
  await mkdir('docs/assets', { recursive: true });
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', await video.path(),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    VIDEO_PATH,
  ]);
});

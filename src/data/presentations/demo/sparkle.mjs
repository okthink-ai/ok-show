import notes from './notes.mjs';

const notAuthored = {
  style: 'Not selected — this slide currently uses HTML/CSS artwork.',
  imagePrompt: 'No image prompt has been authored for this slide.',
  motionPrompt: 'No motion prompt has been authored for this slide.',
};

export default Object.fromEntries(Object.keys(notes).map((slideId) => [slideId, notAuthored]));

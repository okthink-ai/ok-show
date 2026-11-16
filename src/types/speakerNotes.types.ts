export interface SparklePromptInfo {
  style: string;
  imagePrompt: string;
  motionPrompt: string;
}

export type SparklePromptField = keyof SparklePromptInfo;
export type SparklePromptMap = Record<string, SparklePromptInfo>;

export const EMPTY_SPARKLE_PROMPT: SparklePromptInfo = {
  style: 'Not selected — this slide currently uses HTML/CSS artwork.',
  imagePrompt: 'No image prompt has been authored for this slide.',
  motionPrompt: 'No motion prompt has been authored for this slide.',
};

export function hasAuthoredSparkleImage(prompt: SparklePromptInfo): boolean {
  return prompt.imagePrompt !== EMPTY_SPARKLE_PROMPT.imagePrompt;
}

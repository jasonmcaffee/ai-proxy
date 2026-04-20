/* eslint-disable @typescript-eslint/no-var-requires */
const baseWorkflow = require('./jason-moody-zib-zit.json');

const DEFAULT_NEGATIVE_PROMPT = (baseWorkflow as Record<string, { inputs: { text?: string } }>)['490']?.inputs?.text ??
  'blurry, low-resolution, low-quality image, eerie appearance, extra arms, extra legs, ugly, noisy';

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_SCALE = 1.6;

type WorkflowNode = { inputs: Record<string, unknown>; class_type: string; _meta: { title: string } };
export type Workflow = Record<string, WorkflowNode>;

interface ZibZitWorkflowParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  scale?: number;
}

/**
 * Builds a ComfyUI workflow object for the zib-zit-moody model from the given params.
 * Deep-clones the base workflow JSON and injects prompt, size, and scale values.
 * @param params - generation parameters including prompt, dimensions, and scale
 */
export function createZibZitWorkflow({ prompt, negativePrompt, width, height, scale }: ZibZitWorkflowParams): Workflow {
  const workflow: Workflow = JSON.parse(JSON.stringify(baseWorkflow));

  workflow['45'].inputs.text = prompt;
  workflow['490'].inputs.text = negativePrompt ?? DEFAULT_NEGATIVE_PROMPT;
  workflow['516'].inputs.int = width ?? DEFAULT_WIDTH;
  workflow['518'].inputs.int = height ?? DEFAULT_HEIGHT;
  workflow['520'].inputs.Number = parseFloat(String(scale ?? DEFAULT_SCALE));

  workflow['446'].inputs.lora_1 = { on: true, lora: 'zit\\may_model_v1.safetensors', strength: 0 };
  workflow['446'].inputs.lora_2 = { on: true, lora: 'zit\\may_model_v1.safetensors', strength: 0 };
  workflow['446'].inputs.lora_3 = { on: true, lora: 'zit\\may_model_v1.safetensors', strength: 0 };

  console.log('[createZibZitWorkflow] width:', width ?? DEFAULT_WIDTH, 'height:', height ?? DEFAULT_HEIGHT, 'scale:', scale ?? DEFAULT_SCALE);
  return workflow;
}

/**
 * Parses an OpenAI-style size string (e.g. "1024x1024") into width and height integers.
 * Falls back to default HD landscape dimensions if the string is missing or malformed.
 * @param size - size string in "WxH" format
 */
export function parseSizeToWidthHeight(size?: string): { width: number; height: number } {
  if (!size) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  const parts = size.toLowerCase().split('x');
  if (parts.length === 2) {
    const width = parseInt(parts[0], 10);
    const height = parseInt(parts[1], 10);
    if (width > 0 && height > 0) return { width, height };
  }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

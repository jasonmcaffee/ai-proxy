import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Workflow } from './zibZitWorkflow';

const COMFYUI_BASE_URL = process.env.COMFYUI_BASE_URL ?? 'http://localhost:8083';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 300_000;

interface PromptResponse { prompt_id: string; number: number }
interface HistoryImage { filename: string; subfolder: string; type: string }
interface HistoryNodeOutput { images?: HistoryImage[] }
export interface HistoryEntry { outputs: Record<string, HistoryNodeOutput> }

/**
 * Submits a workflow to the ComfyUI API and returns the prompt_id and queue number.
 * @param workflow - ComfyUI workflow node graph to execute
 */
async function submitWorkflow(workflow: Workflow): Promise<PromptResponse> {
  const response = await fetch(`${COMFYUI_BASE_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ComfyUI submit failed: ${response.status} - ${errorText}`);
  }
  return response.json();
}

/**
 * Polls /history/{promptId} every 2 seconds until the job produces output images or times out.
 * @param promptId - the prompt ID returned by submitWorkflow
 */
async function pollUntilComplete(promptId: string): Promise<HistoryEntry> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${COMFYUI_BASE_URL}/history/${promptId}`);
    if (!res.ok) continue;
    const history: Record<string, HistoryEntry> = await res.json();
    const entry = history[promptId];
    if (entry && hasOutputImages(entry)) return entry;
  }
  throw new InternalServerErrorException(`ComfyUI job ${promptId} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

/**
 * Returns true if the history entry has at least one output image across all nodes.
 * @param entry - ComfyUI history entry for a given promptId
 */
function hasOutputImages(entry: HistoryEntry): boolean {
  return Object.values(entry.outputs).some(o => (o.images?.length ?? 0) > 0);
}

/**
 * Fetches the first output image from a completed history entry and returns it as a base64 string.
 * @param entry - completed ComfyUI history entry containing output image metadata
 */
async function fetchFirstImageAsBase64(entry: HistoryEntry): Promise<string> {
  for (const nodeOutput of Object.values(entry.outputs)) {
    if (!nodeOutput.images?.length) continue;
    const img = nodeOutput.images[0];
    const params = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type });
    const res = await fetch(`${COMFYUI_BASE_URL}/view?${params}`);
    if (!res.ok) throw new Error(`ComfyUI image fetch failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.toString('base64');
  }
  throw new InternalServerErrorException('No output images found in ComfyUI history entry');
}

/**
 * NestJS injectable service wrapping ComfyUI HTTP calls: submit workflow, poll for completion, fetch image.
 */
@Injectable()
export class ComfyUIClientService {
  /**
   * Submits a workflow, waits for completion, and returns the first output image as a base64 string.
   * @param workflow - ComfyUI workflow to run
   */
  async runWorkflowAndGetImage(workflow: Workflow): Promise<string> {
    const { prompt_id } = await submitWorkflow(workflow);
    console.log(`[ComfyUIClientService] submitted promptId=${prompt_id}`);
    const entry = await pollUntilComplete(prompt_id);
    console.log(`[ComfyUIClientService] completed promptId=${prompt_id}`);
    return fetchFirstImageAsBase64(entry);
  }
}

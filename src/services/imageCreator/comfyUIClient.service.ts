import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Workflow } from './zibZitWorkflow';

const COMFYUI_BASE_URL = process.env.COMFYUI_BASE_URL ?? 'http://localhost:8083';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 3_600_000; // 1 hour

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
 * Cancels a ComfyUI job: removes it from the pending queue and interrupts it if currently running.
 * Mirrors the ang project's cancel route which calls both deleteFromQueue and interrupt.
 * @param promptId - the prompt ID to cancel
 */
async function cancelComfyJob(promptId: string): Promise<void> {
  await Promise.allSettled([
    fetch(`${COMFYUI_BASE_URL}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete: [promptId] }),
    }),
    fetch(`${COMFYUI_BASE_URL}/interrupt`, { method: 'POST' }),
  ]);
  console.log(`[ComfyUIClientService] cancelled promptId=${promptId}`);
}

/**
 * Polls /history/{promptId} every 2 seconds until the job produces output images, times out, or is aborted.
 * On abort, calls cancelComfyJob to remove the job from ComfyUI's queue/execution.
 * @param promptId - the prompt ID returned by submitWorkflow
 * @param signal - optional AbortSignal; triggers ComfyUI cancellation when fired
 */
async function pollUntilComplete(promptId: string, signal?: AbortSignal): Promise<HistoryEntry> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      await cancelComfyJob(promptId);
      throw new Error('Image generation aborted by client');
    }
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
   * If the AbortSignal fires during polling, the ComfyUI job is cancelled before throwing.
   * @param workflow - ComfyUI workflow to run
   * @param signal - optional AbortSignal; cancels the ComfyUI job if the client disconnects
   */
  async runWorkflowAndGetImage(workflow: Workflow, signal?: AbortSignal): Promise<string> {
    const { prompt_id } = await submitWorkflow(workflow);
    console.log(`[ComfyUIClientService] submitted promptId=${prompt_id}`);
    const entry = await pollUntilComplete(prompt_id, signal);
    console.log(`[ComfyUIClientService] completed promptId=${prompt_id}`);
    return fetchFirstImageAsBase64(entry);
  }
}

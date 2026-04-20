import { Injectable } from '@nestjs/common';
import { ImageGenerationRequestDto, ImageGenerationResponseDto } from '../../models/imageCreator/imageCreation.dto';
import { ComfyUIClientService } from './comfyUIClient.service';
import { createZibZitWorkflow, parseSizeToWidthHeight } from './zibZitWorkflow';

/** Maps model names to workflow identifiers. All models currently route to zib-zit-moody. */
const MODEL_WORKFLOW_MAP: Record<string, string> = {};
const DEFAULT_WORKFLOW = 'zib-zit-moody';

/**
 * Returns the workflow name to use for the given model, defaulting to zib-zit-moody.
 * @param model - model name from the request
 */
function resolveWorkflow(model?: string): string {
  return (model && MODEL_WORKFLOW_MAP[model]) ?? DEFAULT_WORKFLOW;
}

/**
 * Builds a ComfyUI workflow from the generation request parameters.
 * @param dto - image generation request DTO
 */
function buildWorkflow(dto: ImageGenerationRequestDto) {
  const { width, height } = parseSizeToWidthHeight(dto.size);
  return createZibZitWorkflow({
    prompt: dto.prompt,
    negativePrompt: dto.negativePrompt,
    width,
    height,
  });
}

/**
 * Orchestrates image generation: resolves workflow, submits to ComfyUI, and returns OpenAI-format response.
 */
@Injectable()
export class ImageCreatorService {
  constructor(private readonly comfyUIClient: ComfyUIClientService) {}

  /**
   * Generates an image using the zib-zit-moody ComfyUI workflow and returns it as b64_json.
   * @param dto - OpenAI-compatible image generation request, plus optional negativePrompt extension
   */
  async generateImages(dto: ImageGenerationRequestDto): Promise<ImageGenerationResponseDto> {
    const workflow = resolveWorkflow(dto.model);
    console.log(`[ImageCreatorService] generating image, workflow=${workflow}, prompt="${dto.prompt.slice(0, 80)}"`);

    const comfyWorkflow = buildWorkflow(dto);
    const b64Image = await this.comfyUIClient.runWorkflowAndGetImage(comfyWorkflow);

    return {
      created: Math.floor(Date.now() / 1000),
      data: [{ b64_json: b64Image, revised_prompt: dto.prompt }],
    };
  }
}

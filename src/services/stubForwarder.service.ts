import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub forwarder for modalities not supported by the local llama.cpp model.
 * Each method throws NotImplementedException (HTTP 501).
 * Replace the throw with a real provider call when ready to implement.
 */
@Injectable()
export class StubForwarderService {
  /** @throws NotImplementedException - image generation is not implemented */
  imageGeneration(): never {
    throw new NotImplementedException('Image generation is not implemented in this proxy');
  }

  /** @throws NotImplementedException - audio transcription is not implemented */
  audioTranscription(): never {
    throw new NotImplementedException('Audio transcription (speech-to-text) is not implemented in this proxy');
  }

  /** @throws NotImplementedException - text-to-speech is not implemented */
  audioSpeech(): never {
    throw new NotImplementedException('Text-to-speech is not implemented in this proxy');
  }

  /** @throws NotImplementedException - video generation is not implemented */
  videoGeneration(): never {
    throw new NotImplementedException('Video generation is not implemented in this proxy');
  }
}

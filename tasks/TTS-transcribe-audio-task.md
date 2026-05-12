the transcribe audio project now has the ability to do text to speech.

Analyze the integration tests it has with chatterbox, and update our code to point to it for audio speech.
Our old code path that uses speaches should still be available when a "legacy" option is passed in to our endpoint.
but otherwise, all requests should route to transcribe audio service.
C:\jason\dev\transcribe-audio

We will want to ensure we return voices available, synchronous tts, and streaming tts, etc.


We recently added diarization to our audio transcriptions endpoint, and it works really well.
Currently "diarization" uses a new code path to hit our transcribe-audio service, and non-diarization goes to speaches.
Let's have the non-diarization code path also hit our transcribe-audio service.

Let's create a new option called "legacy" that routes to speaches.
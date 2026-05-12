we have an audioTranscriptions.controller.ts that we want to add a new option for, to allow the use of 
a new transcription service that offers multiple speaker diarization.

We want to add a new optional param called "diarization" (default false).
When true, it should execute a new code path you will introduce, which calls our new transcribe-audio
service. 

Transcribe audio source and readme with client instructions can be found here:
C:\jason\dev\transcribe-audio\README.md 

We want both streaming and non-streaming options. Our client will send audio periodically for realtime streaming (e.g. every 5 seconds), and we will forward that audio chunk on, and return the results.

We particularly are concerned with returning results that have the speaker identified (SPEAKER_01, SPEAKER_02, etc).

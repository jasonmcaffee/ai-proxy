Let's integrate with speaches, our speech to text service, and provide an openai compliant endpoint
(already stubbed in AudioTranscriptionsController) 

The integration with speaches has already been done in another project, so we can reference that code to create our own code
that is compliant with the rest of this project's practices.

# Existing integration code
can be found in C:\jason\dev\ai-service\backend\src\services\speechAudio.service.ts which has a speechToText function.

# Speaches Service
The speech to text service code is running here, in case you run into errors and need to look C:\jason\dev\speaches.

# Verify
Implement the control, wire things up, generate our client, write an integration test that verifies it works as expected.

## Spoken audio
Use the tests/fixtures/speech-to-text-test-file.m4a for the integration test. 

### Text spoken in that audio file
Hello, this is a test of the national broadcasting system.  I am a cat that is sitting on a red shelf.
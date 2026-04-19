Let's build an ai-proxy project that supports the openai api.

# Functionality
There is certain functionality we will add that will be in addition to openai spec.

## Context Manager
We will allow for an option to be passed in to inference endpoints to enable context compression.
When enabled, we want to use the same strategies for context compression that are found in:
C:\jason\dev\job-apply-v2\LlamaCppClient

- ensuring only 1 image is in context
- removing older messages if context is above threshold.

The api body should look something like:
{
  compressionOptions: {
     enabled: true,
     maxContextSize: 100000,
  }
}

## Retry
Look at the retry functionality in:
C:\jason\dev\job-apply-v2\LlamaCppClient
Lets add similar retry logic, as well as detecting quirks, like reasoning_content being populated with no content or tool calls.

NOTE: we need to think deeply about whether we can detect reasoning_content issue while doing streaming.  
## reasoning_content
Not officially part of the OpenAI spec, but we want to return it in or messages (see LLamaCPPCLient code)

# Streaming with tool calling. 
Let's add an option to the request that's related to streaming.
{
   awaitToolCallCompletion: true
}

When that is enabled, we want to gather all the json from the streamed result before sending it back to the client.

That way the client doesn't need to wait for all the tool calls to stream back, concat, then handle the json.

# Forwarding
## Llama.cpp
Llama.cpp runs on localhost:8080.
We need to support streaming, tool calling, etc.

Our llm only supports vision (looking at an image) and tool calling, inference, reasoning.
It does not support image generation, text to speech, or speech to text, or video generation.

So we will need a way to intercept those calls and forward them to other services.

We need to make sure we support streaming, and stream data back as we get it from llama.cpp.

## Image generation
Don't worry about implementing image right now.  Just have a hook to intercept image creation calls, and stub out a function that is empty.

## Speech to Text
Just stub it out for now. We will forward it to another service endpoint later.

## Text to SPeech
Just stub it out for now. We will forward it to another service endpoint later.

## Video Generation 
Just stub it out for now. We will forward it to another service endpoint later.

# Tech Stack
Let's use nest.js.  Let's have it generate openapi specs with swagger.  We will also generate a client.

## OpenAPI spec and Client generation
On service start, we should generate and write the openapi-spec.json to disk.
We should have a client generator script like:
"generate-ai-client-win": "npx openapi-generator-cli generate -i src/openapi-spec.json -g typescript-fetch -o ./src/client/api-client --additional-properties=useSingleRequestParameter=false"

This has been solved in C:\jason\dev\ai-service pretty well, so look there.

## Client folder
at the root of the project, create a client dir, that has it's own package.json and readme.  We want to provide guidance
on how other apps can install it, by pointing to the local dir.  


# Testing
We want integration tests that use the generated client, and call the actual llama.cpp server to verify behavior.
We want extensive testing that verifies all the different options.

## Streaming
Do streaming both with and without tool calls.  Verify streaming works and tool calls are invoked (do a simple calculator tool and ask the llm to invoke it)

## Error states
For error handling (retry, etc) we can use some mocked responses from llama.cpp.

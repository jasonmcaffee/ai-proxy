# Use OpenAI sdk
We need to install "openai": "^4.47.1", and use it in or service calls to llama.cpp.
e.g.  const res = await fetch(`${LLAMA_BASE_URL}/v1/chat/completions`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ ...payload, stream: false }),
signal,
});

should be calling the chat.completions.create function of openai.

openai sdk already supports streaming.

# Make our generated client look like openai's sdk.
We want to continue generating the client from the openapi spec, but
we want our generated client to look like the openai client for the functionality we have implemented.
It's ok we have extra params for disableThinking, compression, etc, but our generated client should look as close to openai as we can get.

Our generated client has a bunch of models that have "Dto" at the end. It's fine for our internal/service dtos to have dto in the name,
but we don't want our generated client files to have that name.

``` 
import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall, ChatCompletionTool } from 'openai/resources/chat/completions';

this.openai.chat.completions.create({
```

Our generated client's types, function names, etc should look the same.

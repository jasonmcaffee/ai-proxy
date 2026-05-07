
# AudioSpeechRequest


## Properties

Name | Type
------------ | -------------
`input` | string
`model` | string
`voice` | string
`responseFormat` | string
`speed` | number

## Example

```typescript
import type { AudioSpeechRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "input": null,
  "model": hexgrad/Kokoro-82M,
  "voice": af_sky,
  "responseFormat": mp3,
  "speed": 1,
} satisfies AudioSpeechRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as AudioSpeechRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



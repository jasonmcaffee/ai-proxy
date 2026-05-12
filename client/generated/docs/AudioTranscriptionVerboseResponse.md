
# AudioTranscriptionVerboseResponse


## Properties

Name | Type
------------ | -------------
`task` | string
`language` | string
`duration` | number
`text` | string
`segments` | [Array&lt;TranscriptionSegment&gt;](TranscriptionSegment.md)
`speakers` | Array&lt;string&gt;

## Example

```typescript
import type { AudioTranscriptionVerboseResponse } from ''

// TODO: Update the object below with actual values
const example = {
  "task": transcribe,
  "language": null,
  "duration": null,
  "text": null,
  "segments": null,
  "speakers": ["SPEAKER_00","SPEAKER_01"],
} satisfies AudioTranscriptionVerboseResponse

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as AudioTranscriptionVerboseResponse
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)




# ImageGenerationRequest


## Properties

Name | Type
------------ | -------------
`prompt` | string
`negativePrompt` | string
`model` | string
`n` | number
`size` | string
`responseFormat` | string
`quality` | string
`style` | string

## Example

```typescript
import type { ImageGenerationRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "prompt": null,
  "negativePrompt": null,
  "model": null,
  "n": 1,
  "size": 1024x1024,
  "responseFormat": b64_json,
  "quality": standard,
  "style": vivid,
} satisfies ImageGenerationRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ImageGenerationRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



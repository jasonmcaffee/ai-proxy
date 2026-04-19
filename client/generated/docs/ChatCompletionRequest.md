
# ChatCompletionRequest


## Properties

Name | Type
------------ | -------------
`messages` | [Array&lt;ChatMessage&gt;](ChatMessage.md)
`model` | string
`temperature` | number
`stream` | boolean
`tools` | [Array&lt;ToolDefinition&gt;](ToolDefinition.md)
`toolChoice` | object
`maxTokens` | number
`compressionOptions` | [CompressionOptions](CompressionOptions.md)
`awaitToolCallCompletion` | boolean
`disableThinking` | boolean

## Example

```typescript
import type { ChatCompletionRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "messages": null,
  "model": null,
  "temperature": null,
  "stream": null,
  "tools": null,
  "toolChoice": null,
  "maxTokens": null,
  "compressionOptions": null,
  "awaitToolCallCompletion": null,
  "disableThinking": null,
} satisfies ChatCompletionRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ChatCompletionRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



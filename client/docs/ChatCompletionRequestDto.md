
# ChatCompletionRequestDto


## Properties

Name | Type
------------ | -------------
`messages` | [Array&lt;ChatMessageDto&gt;](ChatMessageDto.md)
`model` | string
`temperature` | number
`stream` | boolean
`tools` | [Array&lt;ToolDefinitionDto&gt;](ToolDefinitionDto.md)
`toolChoice` | object
`maxTokens` | number
`compressionOptions` | [CompressionOptionsDto](CompressionOptionsDto.md)
`awaitToolCallCompletion` | boolean

## Example

```typescript
import type { ChatCompletionRequestDto } from ''

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
} satisfies ChatCompletionRequestDto

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ChatCompletionRequestDto
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



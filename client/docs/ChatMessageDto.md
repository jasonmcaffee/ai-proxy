
# ChatMessageDto


## Properties

Name | Type
------------ | -------------
`role` | string
`content` | string
`toolCalls` | [Array&lt;ToolCallDto&gt;](ToolCallDto.md)
`toolCallId` | string
`reasoningContent` | string

## Example

```typescript
import type { ChatMessageDto } from ''

// TODO: Update the object below with actual values
const example = {
  "role": user,
  "content": null,
  "toolCalls": null,
  "toolCallId": null,
  "reasoningContent": null,
} satisfies ChatMessageDto

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ChatMessageDto
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



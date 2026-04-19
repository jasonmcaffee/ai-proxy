
# ChatChoice


## Properties

Name | Type
------------ | -------------
`index` | number
`message` | [ChatMessage](ChatMessage.md)
`finishReason` | string

## Example

```typescript
import type { ChatChoice } from ''

// TODO: Update the object below with actual values
const example = {
  "index": null,
  "message": null,
  "finishReason": null,
} satisfies ChatChoice

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ChatChoice
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



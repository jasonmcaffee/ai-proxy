
# ToolCallDto


## Properties

Name | Type
------------ | -------------
`id` | string
`type` | string
`_function` | [FunctionCallDto](FunctionCallDto.md)

## Example

```typescript
import type { ToolCallDto } from ''

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "type": function,
  "_function": null,
} satisfies ToolCallDto

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ToolCallDto
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)




# ToolDefinitionDto


## Properties

Name | Type
------------ | -------------
`type` | string
`_function` | [ToolFunctionDto](ToolFunctionDto.md)

## Example

```typescript
import type { ToolDefinitionDto } from ''

// TODO: Update the object below with actual values
const example = {
  "type": function,
  "_function": null,
} satisfies ToolDefinitionDto

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ToolDefinitionDto
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)




# ModelObject


## Properties

Name | Type
------------ | -------------
`id` | string
`object` | string
`created` | number
`ownedBy` | string

## Example

```typescript
import type { ModelObject } from ''

// TODO: Update the object below with actual values
const example = {
  "id": local-model,
  "object": model,
  "created": null,
  "ownedBy": llama.cpp,
} satisfies ModelObject

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ModelObject
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



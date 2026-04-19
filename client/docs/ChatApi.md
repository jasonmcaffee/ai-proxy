# ChatApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createCompletion**](ChatApi.md#createcompletion) | **POST** /v1/chat/completions | Create a chat completion |



## createCompletion

> ChatCompletionResponseDto createCompletion(chatCompletionRequestDto)

Create a chat completion

### Example

```ts
import {
  Configuration,
  ChatApi,
} from '';
import type { CreateCompletionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChatApi();

  const body = {
    // ChatCompletionRequestDto
    chatCompletionRequestDto: ...,
  } satisfies CreateCompletionRequest;

  try {
    const data = await api.createCompletion(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **chatCompletionRequestDto** | [ChatCompletionRequestDto](ChatCompletionRequestDto.md) |  | |

### Return type

[**ChatCompletionResponseDto**](ChatCompletionResponseDto.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


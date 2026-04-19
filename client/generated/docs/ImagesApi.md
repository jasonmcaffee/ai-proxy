# ImagesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**generateImage**](ImagesApi.md#generateimage) | **POST** /v1/images/generations | Image generation (not implemented — stub 501) |



## generateImage

> generateImage()

Image generation (not implemented — stub 501)

### Example

```ts
import {
  Configuration,
  ImagesApi,
} from '';
import type { GenerateImageRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ImagesApi();

  try {
    const data = await api.generateImage();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **501** | Not implemented |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


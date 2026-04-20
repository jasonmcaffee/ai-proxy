# ImagesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**generateImage**](ImagesApi.md#generateimage) | **POST** /v1/images/generations | Generate an image using the zib-zit-moody ComfyUI workflow |



## generateImage

> ImageGenerationResponse generateImage(imageGenerationRequest)

Generate an image using the zib-zit-moody ComfyUI workflow

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

  const body = {
    // ImageGenerationRequest
    imageGenerationRequest: ...,
  } satisfies GenerateImageRequest;

  try {
    const data = await api.generateImage(body);
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
| **imageGenerationRequest** | [ImageGenerationRequest](ImageGenerationRequest.md) |  | |

### Return type

[**ImageGenerationResponse**](ImageGenerationResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **500** | ComfyUI unavailable or generation failed |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


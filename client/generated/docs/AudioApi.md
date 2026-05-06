# AudioApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**speak**](AudioApi.md#speak) | **POST** /v1/audio/speech | Text to speech (not implemented — stub 501) |
| [**transcribe**](AudioApi.md#transcribe) | **POST** /v1/audio/transcriptions | Transcribe audio to text using speaches (faster-whisper) |



## speak

> speak()

Text to speech (not implemented — stub 501)

### Example

```ts
import {
  Configuration,
  AudioApi,
} from '';
import type { SpeakRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AudioApi();

  try {
    const data = await api.speak();
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


## transcribe

> AudioTranscriptionResponse transcribe(file, model, language)

Transcribe audio to text using speaches (faster-whisper)

### Example

```ts
import {
  Configuration,
  AudioApi,
} from '';
import type { TranscribeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AudioApi();

  const body = {
    // Blob | Audio file to transcribe
    file: BINARY_DATA_HERE,
    // string | Whisper model name (optional)
    model: model_example,
    // string | ISO 639-1 language code (optional)
    language: language_example,
  } satisfies TranscribeRequest;

  try {
    const data = await api.transcribe(body);
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
| **file** | `Blob` | Audio file to transcribe | [Defaults to `undefined`] |
| **model** | `string` | Whisper model name | [Optional] [Defaults to `undefined`] |
| **language** | `string` | ISO 639-1 language code | [Optional] [Defaults to `undefined`] |

### Return type

[**AudioTranscriptionResponse**](AudioTranscriptionResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `multipart/form-data`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **500** | Transcription failed |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


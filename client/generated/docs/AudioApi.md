# AudioApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**speak**](AudioApi.md#speak) | **POST** /v1/audio/speech | Generate speech audio from text via speaches (sync) |
| [**speakStream**](AudioApi.md#speakstream) | **POST** /v1/audio/speech/stream | Generate speech audio sentence-by-sentence over SSE |
| [**transcribe**](AudioApi.md#transcribe) | **POST** /v1/audio/transcriptions | Transcribe audio to text using speaches (faster-whisper) |



## speak

> Blob speak(audioSpeechRequest)

Generate speech audio from text via speaches (sync)

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

  const body = {
    // AudioSpeechRequest
    audioSpeechRequest: ...,
  } satisfies SpeakRequest;

  try {
    const data = await api.speak(body);
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
| **audioSpeechRequest** | [AudioSpeechRequest](AudioSpeechRequest.md) |  | |

### Return type

**Blob**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `audio/mpeg`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Binary audio body |  -  |
| **400** | Missing or invalid input |  -  |
| **500** | Speech synthesis failed |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## speakStream

> AudioSpeechStreamChunk speakStream(audioSpeechRequest)

Generate speech audio sentence-by-sentence over SSE

### Example

```ts
import {
  Configuration,
  AudioApi,
} from '';
import type { SpeakStreamRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AudioApi();

  const body = {
    // AudioSpeechRequest
    audioSpeechRequest: ...,
  } satisfies SpeakStreamRequest;

  try {
    const data = await api.speakStream(body);
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
| **audioSpeechRequest** | [AudioSpeechRequest](AudioSpeechRequest.md) |  | |

### Return type

[**AudioSpeechStreamChunk**](AudioSpeechStreamChunk.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `text/event-stream`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | SSE stream of audio chunks |  -  |

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


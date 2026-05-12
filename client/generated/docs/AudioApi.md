# AudioApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**speak**](AudioApi.md#speak) | **POST** /v1/audio/speech | Generate speech audio from text via speaches (sync) |
| [**speakStream**](AudioApi.md#speakstream) | **POST** /v1/audio/speech/stream | Generate speech audio sentence-by-sentence over SSE |
| [**transcribe**](AudioApi.md#transcribe) | **POST** /v1/audio/transcriptions | Transcribe audio to text. With diarization&#x3D;true, returns verbose_json with per-segment speaker labels. |



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

> Transcribe200Response transcribe(file, model, language, diarization, minSpeakers, maxSpeakers)

Transcribe audio to text. With diarization&#x3D;true, returns verbose_json with per-segment speaker labels.

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
    // boolean | Enable speaker diarization (routes to transcribe-audio service) (optional)
    diarization: true,
    // number | Minimum speaker count hint (diarization=true only) (optional)
    minSpeakers: 56,
    // number | Maximum speaker count hint (diarization=true only) (optional)
    maxSpeakers: 56,
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
| **diarization** | `boolean` | Enable speaker diarization (routes to transcribe-audio service) | [Optional] [Defaults to `false`] |
| **minSpeakers** | `number` | Minimum speaker count hint (diarization&#x3D;true only) | [Optional] [Defaults to `undefined`] |
| **maxSpeakers** | `number` | Maximum speaker count hint (diarization&#x3D;true only) | [Optional] [Defaults to `undefined`] |

### Return type

[**Transcribe200Response**](Transcribe200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `multipart/form-data`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Transcription result — plain {text} when diarization&#x3D;false, verbose with speakers when diarization&#x3D;true |  -  |
| **500** | Transcription failed |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


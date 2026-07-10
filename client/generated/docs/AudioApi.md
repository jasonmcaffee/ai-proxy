# AudioApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**listVoices**](AudioApi.md#listvoices) | **GET** /v1/audio/voices | List voices available from the Chatterbox TTS engine |
| [**speak**](AudioApi.md#speak) | **POST** /v1/audio/speech | Generate speech audio from text (default: Chatterbox WAV; legacy:true → speaches MP3) |
| [**speakStream**](AudioApi.md#speakstream) | **POST** /v1/audio/speech/stream | Generate speech audio sentence-by-sentence over SSE (default: Chatterbox; legacy:true → speaches) |
| [**transcribe**](AudioApi.md#transcribe) | **POST** /v1/audio/transcriptions | Transcribe audio. Default: transcribe-audio (Whisper large-v3). legacy&#x3D;true: speaches. diarization&#x3D;true: transcribe-audio with speaker labels. |



## listVoices

> listVoices()

List voices available from the Chatterbox TTS engine

### Example

```ts
import {
  Configuration,
  AudioApi,
} from '';
import type { ListVoicesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AudioApi();

  try {
    const data = await api.listVoices();
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
| **200** | Array of available voices with id, language, and gender |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## speak

> Blob speak(audioSpeechRequest)

Generate speech audio from text (default: Chatterbox WAV; legacy:true → speaches MP3)

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
- **Accept**: `audio/wav`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Binary audio body |  -  |
| **400** | Missing or invalid input |  -  |
| **404** | Unknown voice |  -  |
| **500** | Speech synthesis failed |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## speakStream

> AudioSpeechStreamChunk speakStream(audioSpeechRequest)

Generate speech audio sentence-by-sentence over SSE (default: Chatterbox; legacy:true → speaches)

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

> Transcribe200Response transcribe(file, model, language, diarization, legacy, minSpeakers, maxSpeakers)

Transcribe audio. Default: transcribe-audio (Whisper large-v3). legacy&#x3D;true: speaches. diarization&#x3D;true: transcribe-audio with speaker labels.

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
    // string | Whisper model name (legacy=true only) (optional)
    model: model_example,
    // string | ISO 639-1 language code (optional)
    language: language_example,
    // boolean | Enable speaker diarization — returns verbose_json with per-segment speaker labels. Mutually exclusive with legacy. (optional)
    diarization: true,
    // boolean | Use legacy speaches (faster-whisper) backend. Returns plain {text}. Mutually exclusive with diarization. (optional)
    legacy: true,
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
| **model** | `string` | Whisper model name (legacy&#x3D;true only) | [Optional] [Defaults to `undefined`] |
| **language** | `string` | ISO 639-1 language code | [Optional] [Defaults to `undefined`] |
| **diarization** | `boolean` | Enable speaker diarization — returns verbose_json with per-segment speaker labels. Mutually exclusive with legacy. | [Optional] [Defaults to `false`] |
| **legacy** | `boolean` | Use legacy speaches (faster-whisper) backend. Returns plain {text}. Mutually exclusive with diarization. | [Optional] [Defaults to `false`] |
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
| **200** | Plain {text} by default or with legacy&#x3D;true; verbose response with speaker segments when diarization&#x3D;true |  -  |
| **500** | Transcription failed |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


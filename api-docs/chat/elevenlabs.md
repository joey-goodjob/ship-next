---
title: Speech to Text quickstart
subtitle: Learn how to convert spoken audio into text.
---

This guide will show you how to convert spoken audio into text using the Speech to Text API.

<Tip>
  Use the [ElevenLabs speech-to-text skill](https://github.com/elevenlabs/skills/tree/main/speech-to-text) to transcribe audio from your AI coding assistant:

```bash
npx skills add elevenlabs/skills --skill speech-to-text
```

</Tip>

<Info>
  This tutorial will demonstrate how to use the Batch Speech to Text API. For a guide on how to use
  the Realtime Speech to Text API, see the [Client-side
  streaming](/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming) or
  [Server-side
  streaming](/docs/eleven-api/guides/how-to/speech-to-text/realtime/server-side-streaming) guides.
</Info>

## Using the Speech to Text API

<Steps>
    <Step title="Create an API key">
        [Create an API key in the dashboard here](https://elevenlabs.io/app/settings/api-keys), which you’ll use to securely [access the API](/docs/api-reference/authentication).

        Store the key as a managed secret and pass it to the SDKs either as a environment variable via an `.env` file, or directly in your app’s configuration depending on your preference.

        ```js title=".env"
        ELEVENLABS_API_KEY=<your_api_key_here>
        ```

    </Step>
    <Step title="Install the SDK">
        We'll also use the `dotenv` library to load our API key from an environment variable.

        <CodeBlocks>
            ```python
            pip install elevenlabs
            pip install python-dotenv
            ```

            ```typescript
            npm install @elevenlabs/elevenlabs-js
            npm install dotenv
            ```

        </CodeBlocks>

    </Step>
    <Step title="Make the API request">
        Create a new file named `example.py` or `example.mts`, depending on your language of choice and add the following code:

        <CodeBlocks>
        ```python maxLines=0
        # example.py
        import os
        from dotenv import load_dotenv
        from io import BytesIO
        import requests
        from elevenlabs.client import ElevenLabs

        load_dotenv()

        elevenlabs = ElevenLabs(
          api_key=os.getenv("ELEVENLABS_API_KEY"),
        )

        audio_url = (
            "https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3"
        )
        response = requests.get(audio_url)
        audio_data = BytesIO(response.content)

        transcription = elevenlabs.speech_to_text.convert(
            file=audio_data,
            model_id="scribe_v2", # Model to use
            tag_audio_events=True, # Tag audio events like laughter, applause, etc.
            language_code="eng", # Language of the audio file. If set to None, the model will detect the language automatically.
            diarize=True, # Whether to annotate who is speaking
        )

        print(transcription)
        ```

        ```typescript maxLines=0
        // example.mts
        import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
        import "dotenv/config";

        const elevenlabs = new ElevenLabsClient();

        const response = await fetch(
          "https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3"
        );
        const audioBlob = new Blob([await response.arrayBuffer()], { type: "audio/mp3" });

        const transcription = await elevenlabs.speechToText.convert({
          file: audioBlob,
          modelId: "scribe_v2", // Model to use
          tagAudioEvents: true, // Tag audio events like laughter, applause, etc.
          languageCode: "eng", // Language of the audio file. If set to null, the model will detect the language automatically.
          diarize: true, // Whether to annotate who is speaking
        });

        console.log(transcription);
        ```
        </CodeBlocks>
    </Step>
    <Step title="Execute the code">
        <CodeBlocks>
            ```python
            python example.py
            ```

            ```typescript
            npx tsx example.mts
            ```
        </CodeBlocks>

        You should see the transcription of the audio file printed to the console.
    </Step>

</Steps>

## Next steps

<CardGroup cols={3}>
  <Card
    title="Batch transcription"
    icon="file:eb6d42a4-280c-427e-aa30-5aa813f5f4e1"
    href="/docs/eleven-api/guides/how-to/speech-to-text/batch"
  >
    Transcribe pre-recorded audio files with speaker diarization and event tagging
  </Card>
  <Card
    title="Realtime transcription"
    icon="file:eb6d42a4-280c-427e-aa30-5aa813f5f4e1"
    href="/docs/eleven-api/guides/how-to/speech-to-text/realtime"
  >
    Stream audio and receive transcriptions in real time
  </Card>
  <Card title="API reference" icon="duotone book" href="/docs/api-reference/speech-to-text/convert">
    Explore all Speech to Text parameters and response formats
  </Card>
</CardGroup>

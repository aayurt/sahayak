from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
import io
import os
import logging
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voiceserver")

whisper_model = None
kokoro_pipeline = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global whisper_model, kokoro_pipeline
    logger.info("Loading faster-whisper model...")
    from faster_whisper import WhisperModel
    whisper_model = WhisperModel(
        os.environ.get("STT_MODEL", "base"),
        device=os.environ.get("STT_DEVICE", "cpu"),
        compute_type=os.environ.get("STT_COMPUTE", "int8"),
    )
    logger.info("Loading Kokoro TTS pipeline...")
    from kokoro import KPipeline
    kokoro_pipeline = KPipeline(lang_code=os.environ.get("TTS_LANG", "a"))
    logger.info("Voice server ready")
    yield
    logger.info("Shutting down")


app = FastAPI(title="Sahayak Voice Server", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "stt": whisper_model is not None,
        "tts": kokoro_pipeline is not None,
        "stt_model": os.environ.get("STT_MODEL", "base"),
        "tts_lang": os.environ.get("TTS_LANG", "a"),
    }


@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...), model: str = Form("base")):
    if whisper_model is None:
        raise HTTPException(503, "STT model not loaded")
    audio_bytes = await file.read()
    segments, info = whisper_model.transcribe(audio_bytes, beam_size=5)
    text = " ".join(seg.text for seg in segments)
    logger.info("STT: %.1fs -> %d chars", info.duration or 0, len(text))
    return {"text": text, "duration": info.duration, "language": info.language}


@app.post("/v1/audio/speech")
async def speak(
    input: str = Form(...),
    voice: str = Form("af_heart"),
    model: str = Form("kokoro"),
    response_format: str = Form("wav"),
):
    if kokoro_pipeline is None:
        raise HTTPException(503, "TTS model not loaded")
    import numpy as np
    import soundfile as sf

    audio_chunks: list[np.ndarray] = []
    for result in kokoro_pipeline(input, voice=voice, speed=1.0):
        if hasattr(result, "audio"):
            audio_chunks.append(result.audio)
        elif isinstance(result, (list, tuple)) and len(result) == 3:
            _, _, audio_array = result
            audio_chunks.append(audio_array)
    if not audio_chunks:
        raise HTTPException(500, "No audio generated")
    audio_data = np.concatenate(audio_chunks)
    buf = io.BytesIO()
    sf.write(buf, audio_data, 24000, format="WAV" if response_format == "wav" else "WAV")
    buf.seek(0)
    logger.info("TTS: %d chars -> %.1fs audio", len(input), len(audio_data) / 24000)
    return Response(content=buf.read(), media_type="audio/wav")

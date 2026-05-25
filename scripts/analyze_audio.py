#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import librosa
import numpy as np


KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def seconds_to_ms(value: float) -> int:
    return max(0, int(round(value * 1000)))


def analyze_audio(input_path: Path) -> dict:
    y, sr = librosa.load(str(input_path), sr=None)
    duration_sec = float(librosa.get_duration(y=y, sr=sr))
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beats, sr=sr).tolist()

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_index = int(np.argmax(np.mean(chroma, axis=1)))

    mfcc = librosa.feature.mfcc(y=y, sr=sr)
    segment_count = min(5, max(1, int(duration_sec // 6) or 1))
    boundaries = librosa.segment.agglomerative(mfcc, k=segment_count)
    boundary_times = sorted(
        {
            round(float(boundary), 6)
            for boundary in librosa.frames_to_time(boundaries, sr=sr).tolist()
            if 0 < float(boundary) < duration_sec
        }
    )

    rms = librosa.feature.rms(y=y)[0]
    rms_times = librosa.frames_to_time(range(len(rms)), sr=sr)

    rms_by_second = []
    for second in range(int(np.ceil(duration_sec))):
        start = float(second)
        end = min(float(second + 1), duration_sec)
        mask = (rms_times >= start) & (rms_times < end)
        avg_rms = float(np.mean(rms[mask])) if np.any(mask) else 0.0
        rms_by_second.append(
            {
                "startMs": seconds_to_ms(start),
                "endMs": seconds_to_ms(end),
                "rms": round(avg_rms, 6),
            }
        )

    segments = []
    all_boundaries = [0.0] + boundary_times + [duration_sec]
    for index in range(len(all_boundaries) - 1):
        start = float(all_boundaries[index])
        end = float(all_boundaries[index + 1])
        mask = (rms_times >= start) & (rms_times < end)
        avg_energy = float(np.mean(rms[mask])) if np.any(mask) else 0.0
        segments.append(
            {
                "startMs": seconds_to_ms(start),
                "endMs": seconds_to_ms(end),
                "durationMs": max(0, seconds_to_ms(end - start)),
                "avgEnergy": round(avg_energy, 6),
            }
        )

    return {
        "durationSec": round(duration_sec, 3),
        "sampleRate": int(sr),
        "bpm": round(float(np.array(tempo).flatten()[0]), 1),
        "key": KEY_NAMES[key_index],
        "beatTimesMs": [seconds_to_ms(float(beat_time)) for beat_time in beat_times],
        "segmentBoundariesMs": [seconds_to_ms(float(boundary)) for boundary in boundary_times],
        "rmsBySecond": rms_by_second,
        "segments": segments,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze audio timing and energy with librosa.")
    parser.add_argument("--input", required=True, help="Local audio file path.")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"Audio file not found: {input_path}")

    print(json.dumps(analyze_audio(input_path), ensure_ascii=False))


if __name__ == "__main__":
    main()

import json

import librosa
import numpy as np


path = "/Users/joey/Music/Music/Media.localized/Music/Unknown Artist/Unknown Album/Open Sky Tonight （素材）.mp3"
y, sr = librosa.load(path, sr=None)

# 基础信息
duration = librosa.get_duration(y=y, sr=sr)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
beat_times = librosa.frames_to_time(beats, sr=sr).tolist()

# 调性
chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
key_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
key_index = int(np.argmax(np.mean(chroma, axis=1)))
key_name = key_names[key_index]

# 段落切分（切5段）
mfcc = librosa.feature.mfcc(y=y, sr=sr)
boundaries = librosa.segment.agglomerative(mfcc, k=5)
boundary_times = librosa.frames_to_time(boundaries, sr=sr).tolist()

# 每段的能量（RMS）
rms = librosa.feature.rms(y=y)[0]
rms_times = librosa.frames_to_time(range(len(rms)), sr=sr)

# 按段落算平均能量
segments = []
all_boundaries = [0.0] + boundary_times + [duration]
for i in range(len(all_boundaries) - 1):
    start = all_boundaries[i]
    end = all_boundaries[i + 1]
    mask = (rms_times >= start) & (rms_times < end)
    avg_energy = float(np.mean(rms[mask])) if np.any(mask) else 0
    segments.append(
        {
            "segment": i + 1,
            "start": round(start, 2),
            "end": round(end, 2),
            "duration": round(end - start, 2),
            "avg_energy": round(avg_energy, 5),
        }
    )

# 按秒算平均 RMS
rms_per_second = []
for sec in range(int(np.ceil(duration))):
    start = float(sec)
    end = min(float(sec + 1), float(duration))
    mask = (rms_times >= start) & (rms_times < end)
    avg_rms = float(np.mean(rms[mask])) if np.any(mask) else 0
    rms_per_second.append(
        {
            "second": sec,
            "start": round(start, 2),
            "end": round(end, 2),
            "avg_rms": round(avg_rms, 5),
        }
    )

result = {
    "file": path,
    "duration_sec": round(duration, 2),
    "sample_rate": sr,
    "bpm": round(float(np.array(tempo).flatten()[0]), 1),
    "key": key_name,
    "total_beats": len(beat_times),
    "beat_times_first_10": [round(b, 3) for b in beat_times[:10]],
    "segment_boundaries": [round(b, 2) for b in boundary_times],
    "segments": segments,
    "rms_per_second": rms_per_second,
}

print(json.dumps(result, indent=2, ensure_ascii=False))

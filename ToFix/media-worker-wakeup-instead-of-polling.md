# Media Worker Wakeup Instead of Constant Polling

## Problem

The Railway media worker currently polls Supabase every few seconds to check whether a `lyric_video_media_job` is queued. During testing, this causes continuous database queries even when there are no real users and no pending jobs.

This is safe and simple, but wasteful for Supabase egress/query usage.

## Current Behavior

- Vercel API creates a `lyric_video_media_job`.
- Railway `media-worker` checks Supabase on an interval.
- If a queued job exists, the worker claims and processes it.
- If no job exists, the worker still keeps polling.

## Desired Behavior

Use a wakeup model:

1. Vercel creates a media job in Supabase.
2. Vercel sends a secure wakeup request to the Railway worker.
3. The worker immediately checks and claims queued jobs.
4. Slow polling remains as a fallback in case the wakeup request fails.

## Proposed Shape

- Add a private Railway worker HTTP endpoint, for example `/internal/media-worker/wake`.
- Protect it with a shared secret header.
- After `createMediaJob()`, Vercel calls the wake endpoint.
- Keep low-frequency polling, such as 30-60 seconds, as a reliability fallback.
- Keep stale job recovery, but run it much less frequently than normal job claiming.

## Why Not Remove Polling Entirely

Polling should remain as a fallback so jobs are not lost if:

- Railway worker restarts
- wakeup request fails
- network request times out
- Vercel deploy happens during job creation
- worker is temporarily unavailable

## Priority

Medium.

This is not required to fix the immediate Supabase egress issue, but it is the better long-term architecture for reducing idle database traffic while keeping job pickup responsive.

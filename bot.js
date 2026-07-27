require('dotenv').config();
const express = require('express');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createWriteStream } = require('node:fs');
const { mkdir, rm, stat } = require('node:fs/promises');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { verifyKeyMiddleware, InteractionType, InteractionResponseType } = require('discord-interactions');
const sharp = require('sharp');

const APP_ID = process.env.DISCORD_APP_ID;
const PORT = process.env.PORT || 8787;
const TARGET_GIF_BYTES = 10 * 1024 * 1024;
const MIN_DIMENSION = 1;
const MIN_VIDEO_SCALE = 0.05;
const VIDEO_FPS = 15;
const TEMP_DIR = join(__dirname, 'temp');

const app = express();

function isGifAttachment(attachment) {
  return attachment.content_type?.toLowerCase() === 'image/gif'
    || attachment.filename?.toLowerCase().endsWith('.gif');
}

function isVideoAttachment(attachment) {
  return attachment.content_type?.toLowerCase().startsWith('video/')
    || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(attachment.filename || '');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1);
  return `${(bytes / (1024 ** (index + 1))).toFixed(1)} ${units[index]}`;
}

function formatDuration(seconds) {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
}

function initialScale(estimatedSize, targetSize) {
  if (estimatedSize <= targetSize) return 1;
  return Math.max(MIN_VIDEO_SCALE, Math.sqrt(targetSize / estimatedSize) * 0.95);
}

function nextDimensions(width, height, gifSize, targetSize) {
  const scale = Math.min(0.9, Math.sqrt(targetSize / gifSize) * 0.95);
  return {
    width: Math.max(MIN_DIMENSION, Math.floor(width * scale)),
    height: Math.max(MIN_DIMENSION, Math.floor(height * scale)),
  };
}

function nextScale(scale, gifSize, targetSize) {
  return Math.max(MIN_VIDEO_SCALE, scale * Math.min(0.9, Math.sqrt(targetSize / gifSize) * 0.95));
}

function estimateImageGifSize(metadata, sourceSize) {
  const pixels = metadata.width * metadata.height;
  return Math.max(sourceSize, Math.round(pixels * 0.35));
}

function estimateVideoGifSize(metadata, sourceSize) {
  if (!metadata?.width || !metadata?.height || !metadata?.duration) {
    return sourceSize * 2;
  }

  const frames = Math.ceil(metadata.duration * VIDEO_FPS);
  return Math.max(sourceSize, Math.round(metadata.width * metadata.height * frames * 0.12));
}

function estimateImageConversionSeconds(metadata) {
  return Math.max(2, Math.ceil((metadata.width * metadata.height) / (1024 * 1024) * 2));
}

function estimateVideoConversionSeconds(metadata) {
  if (!metadata?.duration || !metadata?.width || !metadata?.height) return 15;
  const megapixelFactor = (metadata.width * metadata.height) / (1280 * 720);
  return Math.max(5, Math.ceil(metadata.duration * Math.max(0.3, megapixelFactor * 0.5)));
}

function createProgressReporter(editUrl) {
  const startedAt = Date.now();
  let stage;
  let remainingEtaSeconds;
  let etaUpdatedAt;
  let interval;
  let currentUpdate;

  const elapsedSeconds = () => (Date.now() - startedAt) / 1000;

  const currentEtaSeconds = () => {
    if (!Number.isFinite(remainingEtaSeconds)) return null;
    return Math.max(0, remainingEtaSeconds - (Date.now() - etaUpdatedAt) / 1000);
  };

  const sendCurrentProgress = () => {
    if (!stage) return Promise.resolve();
    if (currentUpdate) return currentUpdate;

    const remaining = currentEtaSeconds();
    const eta = remaining === null ? '' : ` • ETA: ~${formatDuration(remaining)}`;
    const content = `${stage}\nElapsed: ${formatDuration(elapsedSeconds())}${eta}`;
    currentUpdate = updateProgress(editUrl, content).finally(() => {
      currentUpdate = undefined;
    });
    return currentUpdate;
  };

  const pause = async () => {
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
    await currentUpdate;
  };

  return {
    elapsedSeconds,
    async update(nextStage, etaSeconds) {
      await pause();
      stage = nextStage;
      remainingEtaSeconds = etaSeconds;
      etaUpdatedAt = Date.now();
      if (Number.isFinite(etaSeconds)) {
        interval = setInterval(() => {
          void sendCurrentProgress();
        }, 2000);
      }
      await sendCurrentProgress();
    },
    setEta(etaSeconds) {
      if (!Number.isFinite(etaSeconds)) return;
      remainingEtaSeconds = Math.max(0, etaSeconds);
      etaUpdatedAt = Date.now();
    },
    pause,
    async stop() {
      await pause();
      stage = undefined;
    },
  };
}

async function downloadAttachment(sourceUrl) {
  await mkdir(TEMP_DIR, { recursive: true });
  const sourcePath = join(TEMP_DIR, randomUUID());

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Could not download attachment (${response.status}).`);
    }
    if (!response.body) {
      throw new Error('Could not download attachment: no response body.');
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(sourcePath));
    const { size } = await stat(sourcePath);
    return { sourcePath, size };
  } catch (error) {
    await rm(sourcePath, { force: true });
    throw error;
  }
}

async function createGif(sourcePath, width, height) {
  return sharp(sourcePath)
    .resize({ width, height, fit: 'inside', withoutEnlargement: true })
    .gif()
    .toBuffer();
}

function createVideoGif(sourcePath, scale, onProgress) {
  const dimensions = `max(2\\,trunc(iw*${scale}/2)*2):max(2\\,trunc(ih*${scale}/2)*2)`;
  const filters = [
    `[0:v]fps=${VIDEO_FPS},scale=${dimensions}:flags=lanczos,split[frames][palette_input]`,
    '[palette_input]palettegen=stats_mode=diff[palette]',
    '[frames][palette]paletteuse=dither=sierra2_4a',
  ].join(';');

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-progress', 'pipe:2',
      '-nostats',
      '-i', sourcePath,
      '-filter_complex', filters,
      '-loop', '0',
      '-f', 'gif',
      'pipe:1',
    ]);
    const output = [];
    const errors = [];

    let progressOutput = '';
    ffmpeg.stdout.on('data', (chunk) => output.push(chunk));
    ffmpeg.stderr.on('data', (chunk) => {
      errors.push(chunk);
      progressOutput += chunk.toString();
      const lines = progressOutput.split(/\r?\n/);
      progressOutput = lines.pop();
      for (const line of lines) {
        const match = /^out_time_us=(\d+)$/.exec(line);
        if (match) onProgress?.(Number(match[1]) / 1_000_000);
      }
    });
    ffmpeg.on('error', (error) => reject(new Error(`Could not start FFmpeg: ${error.message}`)));
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(output));
        return;
      }

      const message = Buffer.concat(errors).toString().trim() || `FFmpeg exited with code ${code}.`;
      reject(new Error(`Video conversion failed: ${message}`));
    });
  });
}

function probeVideo(sourcePath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn(process.env.FFPROBE_PATH || 'ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,duration:format=duration',
      '-of', 'json',
      sourcePath,
    ]);
    const output = [];
    const errors = [];

    ffprobe.stdout.on('data', (chunk) => output.push(chunk));
    ffprobe.stderr.on('data', (chunk) => errors.push(chunk));
    ffprobe.on('error', (error) => reject(new Error(`Could not start FFprobe: ${error.message}`)));
    ffprobe.on('close', (code) => {
      if (code !== 0) {
        const message = Buffer.concat(errors).toString().trim() || `FFprobe exited with code ${code}.`;
        reject(new Error(message));
        return;
      }

      try {
        const result = JSON.parse(Buffer.concat(output).toString());
        const stream = result.streams?.[0] || {};
        resolve({
          width: Number(stream.width),
          height: Number(stream.height),
          duration: Number(stream.duration || result.format?.duration),
        });
      } catch (error) {
        reject(new Error(`Could not read video metadata: ${error.message}`));
      }
    });
  });
}

async function uploadGif(editUrl, gifBuffer) {
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: '' }));
  form.append('file', new Blob([gifBuffer], { type: 'image/gif' }), 'converted.gif');

  const response = await fetch(editUrl, { method: 'PATCH', body: form });
  if (response.ok) return;

  const body = await response.text();
  const error = new Error(`Discord upload failed (${response.status}): ${body}`);
  error.status = response.status;
  error.responseBody = body;
  throw error;
}

function isAttachmentTooLarge(error) {
  return error.status === 413
    || error.responseBody?.includes('40005')
    || /too large/i.test(error.responseBody || '');
}

async function updateProgress(_editUrl, content) {
  console.log(`[conversion] ${content.replace('\n', ' | ')}`);
}

async function deleteOriginalResponse(editUrl) {
  try {
    const response = await fetch(editUrl, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      console.warn(`[conversion] Could not remove deferred response (${response.status}).`);
    }
  } catch (error) {
    console.warn(`[conversion] Could not remove deferred response: ${error.message}`);
  }
}

async function convertVideoAndUpload(editUrl, sourcePath, sourceSize, progress) {
  let metadata;
  try {
    metadata = await probeVideo(sourcePath);
  } catch (error) {
    console.warn(`[conversion] Could not inspect video: ${error.message}`);
  }

  const maxGifSize = TARGET_GIF_BYTES;
  const estimatedSize = estimateVideoGifSize(metadata, sourceSize);
  let scale = initialScale(estimatedSize, maxGifSize);
  let estimatedSeconds = estimateVideoConversionSeconds(metadata);
  await progress.update(
    `Please wait, your creation is in progress, or something`,
    estimatedSeconds,
  );

  let previousAttemptSeconds = estimatedSeconds;
  const createVideoAttempt = async () => {
    const attemptStartedAt = Date.now();
    const gifBuffer = await createVideoGif(sourcePath, scale, (processedSeconds) => {
      if (!metadata?.duration || processedSeconds <= 0) return;

      const attemptElapsedSeconds = (Date.now() - attemptStartedAt) / 1000;
      if (attemptElapsedSeconds <= 0) return;

      const processingRate = processedSeconds / attemptElapsedSeconds;
      const remainingVideoSeconds = Math.max(0, metadata.duration - processedSeconds);
      progress.setEta(remainingVideoSeconds / processingRate);
    });
    previousAttemptSeconds = (Date.now() - attemptStartedAt) / 1000;
    return gifBuffer;
  };

  let gifBuffer = await createVideoAttempt();

  while (gifBuffer.length > maxGifSize && scale > MIN_VIDEO_SCALE) {
    scale = nextScale(scale, gifBuffer.length, maxGifSize);
    estimatedSeconds = Math.max(2, previousAttemptSeconds);
    await progress.update(`GIF is larger than target; retrying at ${Math.round(scale * 100)}% resolution…`, estimatedSeconds);
    gifBuffer = await createVideoAttempt();
  }

  while (true) {
    try {
      await progress.update('Uploading GIF…', 3);
      await progress.pause();
      await uploadGif(editUrl, gifBuffer);
      console.log(`[conversion] Video GIF uploaded in ${formatDuration(progress.elapsedSeconds())}.`);
      return;
    } catch (error) {
      if (!isAttachmentTooLarge(error) || scale <= MIN_VIDEO_SCALE) {
        throw error;
      }

      scale = nextScale(scale, gifBuffer.length, maxGifSize);
      await progress.update(`Discord rejected the GIF; retrying at ${Math.round(scale * 100)}% resolution…`, previousAttemptSeconds);
      gifBuffer = await createVideoAttempt();
    }
  }
}

async function convertImageAndUpload(editUrl, sourcePath, sourceSize, progress) {
  await progress.update('Inspecting image…');
  const metadata = await sharp(sourcePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Could not determine image dimensions.');
  }

  const maxGifSize = TARGET_GIF_BYTES;
  const estimatedSize = estimateImageGifSize(metadata, sourceSize);
  const scale = initialScale(estimatedSize, maxGifSize);
  let width = Math.max(MIN_DIMENSION, Math.floor(metadata.width * scale));
  let height = Math.max(MIN_DIMENSION, Math.floor(metadata.height * scale));
  const estimatedSeconds = estimateImageConversionSeconds(metadata);
  await progress.update(
    `Estimated GIF size: ${formatBytes(estimatedSize)} (target: ${formatBytes(maxGifSize)}). Creating GIF…`,
    estimatedSeconds,
  );

  let startedAt = Date.now();
  let gifBuffer = await createGif(sourcePath, width, height);
  let previousAttemptSeconds = (Date.now() - startedAt) / 1000;

  while (gifBuffer.length > maxGifSize && (width > MIN_DIMENSION || height > MIN_DIMENSION)) {
    ({ width, height } = nextDimensions(width, height, gifBuffer.length, maxGifSize));
    await progress.update('GIF is larger than target; reducing image resolution…', previousAttemptSeconds);
    startedAt = Date.now();
    gifBuffer = await createGif(sourcePath, width, height);
    previousAttemptSeconds = (Date.now() - startedAt) / 1000;
  }

  while (true) {
    try {
      await progress.pause();
      await uploadGif(editUrl, gifBuffer);
      console.log(`[conversion] Image GIF uploaded in ${formatDuration(progress.elapsedSeconds())}.`);
      return;
    } catch (error) {
      if (!isAttachmentTooLarge(error) || (width === MIN_DIMENSION && height === MIN_DIMENSION)) {
        throw error;
      }

      ({ width, height } = nextDimensions(width, height, gifBuffer.length, maxGifSize));
      await progress.update('Discord rejected the GIF; reducing image resolution…', previousAttemptSeconds);
      startedAt = Date.now();
      gifBuffer = await createGif(sourcePath, width, height);
      previousAttemptSeconds = (Date.now() - startedAt) / 1000;
    }
  }
}

async function convertAndUpload(token, sourceUrl, isVideo) {
  const editUrl = `https://discord.com/api/v10/webhooks/${APP_ID}/${token}/messages/@original`;
  const progress = createProgressReporter(editUrl);
  let sourcePath;

  try {
    const download = await downloadAttachment(sourceUrl);
    sourcePath = download.sourcePath;
    console.log(`[conversion] Downloaded ${formatBytes(download.size)} to temp/${sourcePath.split(/[\\/]/).pop()}.`);

    if (isVideo) {
      await convertVideoAndUpload(editUrl, sourcePath, download.size, progress);
    } else {
      await convertImageAndUpload(editUrl, sourcePath, download.size, progress);
    }
  } catch (error) {
    console.error('[conversion] Conversion failed:', error);
    await deleteOriginalResponse(editUrl);
  } finally {
    await progress.stop();
    if (sourcePath) {
      try {
        await rm(sourcePath, { force: true });
        console.log('[conversion] Removed temporary source file.');
      } catch (error) {
        console.warn(`[conversion] Could not remove temporary source file: ${error.message}`);
      }
    }
  }
}

app.post('/interactions', verifyKeyMiddleware(process.env.DISCORD_PUBLIC_KEY), (req, res) => {
  const interaction = req.body;

  if (interaction.type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { data, token } = interaction;
    const message = data.resolved.messages[data.target_id];
    const attachments = message.attachments || [];
    const attachment = attachments.find((candidate) => !isGifAttachment(candidate));

    if (!attachment) {
      res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
      setImmediate(() => {
        const editUrl = `https://discord.com/api/v10/webhooks/${APP_ID}/${token}/messages/@original`;
        deleteOriginalResponse(editUrl);
      });
      return;
    }

    console.log('[interaction] Deferring conversion response.');
    res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

    setImmediate(() => {
      convertAndUpload(token, attachment.url, isVideoAttachment(attachment))
        .catch((error) => console.error('[conversion] Unexpected conversion error:', error));
    });
    return;
  }

  res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
  setImmediate(() => {
    const editUrl = `https://discord.com/api/v10/webhooks/${APP_ID}/${interaction.token}/messages/@original`;
    deleteOriginalResponse(editUrl);
  });
});

app.listen(PORT, () => console.log(`listening on ${PORT}`));

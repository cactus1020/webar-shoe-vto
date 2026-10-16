export function coverGeometry(videoWidth, videoHeight, width, height) {
  const scale = Math.max(width / videoWidth, height / videoHeight);
  return { scale, renderedWidth: videoWidth * scale, renderedHeight: videoHeight * scale,
    offsetX: (videoWidth * scale - width) / 2, offsetY: (videoHeight * scale - height) / 2 };
}

export function videoPointToScreen(point, width, height, videoWidth, videoHeight, mirrored = false) {
  const cover = coverGeometry(videoWidth, videoHeight, width, height);
  const x = point.x * cover.renderedWidth - cover.offsetX;
  const screenX = mirrored ? width - x : x;
  const screenY = point.y * cover.renderedHeight - cover.offsetY;
  return { screenX, screenY, ndcX: screenX / width * 2 - 1, ndcY: 1 - screenY / height * 2, z: point.z || 0 };
}

export function inferenceGeometry(videoWidth, videoHeight, width, height, size = 256) {
  const cover = coverGeometry(videoWidth, videoHeight, width, height);
  const cropWidth = width / cover.scale;
  const cropHeight = height / cover.scale;
  const scale = Math.min(size / cropWidth, size / cropHeight);
  const drawWidth = Math.round(cropWidth * scale);
  const drawHeight = Math.round(cropHeight * scale);
  return { videoWidth, videoHeight, size, sx: cover.offsetX / cover.scale, sy: cover.offsetY / cover.scale,
    cropWidth, cropHeight, drawWidth, drawHeight,
    padX: Math.floor((size - drawWidth) / 2), padY: Math.floor((size - drawHeight) / 2) };
}

export function modelPointToVideo(x, y, geometry) {
  return { x: (geometry.sx + (x - geometry.padX) / geometry.drawWidth * geometry.cropWidth) / geometry.videoWidth,
    y: (geometry.sy + (y - geometry.padY) / geometry.drawHeight * geometry.cropHeight) / geometry.videoHeight };
}

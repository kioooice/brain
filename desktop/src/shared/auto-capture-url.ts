export const AUTO_CAPTURE_IMAGE_PROTOCOL = "brain-capture";

export function getAutoCaptureImageUrl(entryId: number) {
  return `${AUTO_CAPTURE_IMAGE_PROTOCOL}://entry/${entryId}.png`;
}

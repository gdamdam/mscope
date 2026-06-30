/** Draw a small "frozen / last capture" cue in the top-left of a canvas plot,
 *  shown when the source has ended and the view is holding the last frame. */
export function drawFrozenBadge(
  ctx: CanvasRenderingContext2D,
  x = 6,
  y = 6,
): void {
  ctx.font = "9px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#d8b35a"; // --warn
  ctx.fillText("FROZEN · LAST CAPTURE", x + 2, y);
}

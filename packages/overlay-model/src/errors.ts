import type {
  OverlayFrameIdentifier,
  UtcMillisecondTimestamp,
} from "@atlast/shared";

export class OverlayFrameNotFoundError extends Error {
  readonly code = "OVERLAY_FRAME_NOT_FOUND" as const;
  readonly frameIdentifier: OverlayFrameIdentifier;

  constructor(frameIdentifier: OverlayFrameIdentifier) {
    super(`Overlay frame not found: ${JSON.stringify(frameIdentifier)}`);
    this.name = "OverlayFrameNotFoundError";
    this.frameIdentifier = frameIdentifier;
  }
}

export class NoOverlayFrameAtOrBeforeError extends Error {
  readonly code = "NO_OVERLAY_FRAME_AT_OR_BEFORE" as const;
  readonly topologyAsOf: UtcMillisecondTimestamp;

  constructor(topologyAsOf: UtcMillisecondTimestamp) {
    super(
      `No overlay frame exists at or before topology asOf ${JSON.stringify(topologyAsOf)}`,
    );
    this.name = "NoOverlayFrameAtOrBeforeError";
    this.topologyAsOf = topologyAsOf;
  }
}

export class OverlayProjectionInputError extends Error {
  readonly code = "INVALID_OVERLAY_PROJECTION_INPUT" as const;

  constructor(message: string) {
    super(`Invalid overlay projection input: ${message}`);
    this.name = "OverlayProjectionInputError";
  }
}

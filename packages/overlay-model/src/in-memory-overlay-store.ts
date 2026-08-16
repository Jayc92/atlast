import {
  compareRawUtf16,
  overlayFrameCollectionSchema,
  overlayFrameIdentifierSchema,
  overlayFrameSchema,
  utcMillisecondTimestampSchema,
  type OperationalOverlayStore,
  type OverlayFrame,
  type OverlayFrameCollection,
  type OverlayFrameIdentifier,
  type UtcMillisecondTimestamp,
} from "@atlast/shared";
import {
  NoOverlayFrameAtOrBeforeError,
  OverlayFrameNotFoundError,
} from "./errors.ts";

function compareFrames(left: OverlayFrame, right: OverlayFrame): number {
  return (
    compareRawUtf16(left.effectiveAt, right.effectiveAt) ||
    compareRawUtf16(left.identifier, right.identifier)
  );
}

/** Immutable, bounded in-memory implementation of the shared overlay port. */
export class InMemoryOperationalOverlayStore implements OperationalOverlayStore {
  readonly #frames: OverlayFrameCollection;
  readonly #framesByIdentifier: ReadonlyMap<
    OverlayFrameIdentifier,
    OverlayFrame
  >;

  constructor(frames: readonly unknown[]) {
    const parsedFrames = frames.map((frame) => overlayFrameSchema.parse(frame));
    parsedFrames.sort(compareFrames);
    this.#frames = overlayFrameCollectionSchema.parse(parsedFrames);
    this.#framesByIdentifier = new Map(
      this.#frames.map((frame) => [frame.identifier, frame]),
    );
  }

  get frames(): OverlayFrameCollection {
    return this.#frames;
  }

  getFrameByIdentifier(
    frameIdentifier: OverlayFrameIdentifier,
  ): Promise<OverlayFrame> {
    const parsedIdentifier =
      overlayFrameIdentifierSchema.parse(frameIdentifier);
    const frame = this.#framesByIdentifier.get(parsedIdentifier);
    if (frame === undefined) {
      return Promise.reject(new OverlayFrameNotFoundError(parsedIdentifier));
    }
    return Promise.resolve(frame);
  }

  getLatestFrameAtOrBefore(
    topologyAsOf: UtcMillisecondTimestamp,
  ): Promise<OverlayFrame> {
    const parsedAsOf = utcMillisecondTimestampSchema.parse(topologyAsOf);
    for (let index = this.#frames.length - 1; index >= 0; index -= 1) {
      const frame = this.#frames[index];
      if (frame !== undefined && frame.effectiveAt <= parsedAsOf) {
        return Promise.resolve(frame);
      }
    }
    return Promise.reject(new NoOverlayFrameAtOrBeforeError(parsedAsOf));
  }
}

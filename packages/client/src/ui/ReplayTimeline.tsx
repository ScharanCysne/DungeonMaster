export function ReplayTimeline({
  beat,
  beats,
  onSeek,
}: {
  beat: number;
  beats: number;
  onSeek: (beat: number) => void;
}) {
  return (
    <nav className="replay-timeline" aria-label="Replay timeline">
      <button disabled={beat === 0} onClick={() => onSeek(beat - 1)}>
        Previous
      </button>
      <label>
        Beat {beat} of {beats}
        <input
          aria-label="Replay beat"
          type="range"
          min={0}
          max={beats}
          step={1}
          value={beat}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
      </label>
      <button disabled={beat === beats} onClick={() => onSeek(beat + 1)}>
        Next
      </button>
    </nav>
  );
}

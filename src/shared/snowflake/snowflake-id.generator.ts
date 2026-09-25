/**
 * 64-bit Snowflake-style ID generator.
 *
 * Layout (MSB -> LSB), all within a 63-bit positive BigInt so the value
 * round-trips safely through jsonb/text columns and JS `BigInt`/`string`:
 *   41 bits - milliseconds since EPOCH
 *   10 bits - machine id (0-1023), distinguishes instances of the same service
 *   12 bits - per-millisecond sequence (0-4095)
 *
 * This is the reference implementation for the whole platform (see Story 1.1
 * Design Notes): no domain aggregate ID may use UUID, only Snowflake IDs
 * produced by this generator. `tenant-microservice` (Story 1.3) should reuse
 * this exact class rather than re-implementing it.
 */
export class SnowflakeIdGenerator {
  // 2024-01-01T00:00:00.000Z, arbitrary but fixed epoch for this platform.
  private static readonly EPOCH = 1704067200000n;
  private static readonly MACHINE_ID_BITS = 10n;
  private static readonly SEQUENCE_BITS = 12n;
  private static readonly MAX_MACHINE_ID =
    (1n << SnowflakeIdGenerator.MACHINE_ID_BITS) - 1n;
  private static readonly MAX_SEQUENCE =
    (1n << SnowflakeIdGenerator.SEQUENCE_BITS) - 1n;

  private readonly machineId: bigint;
  private sequence = 0n;
  private lastTimestamp = -1n;

  constructor(machineId: number) {
    if (
      !Number.isInteger(machineId) ||
      BigInt(machineId) < 0n ||
      BigInt(machineId) > SnowflakeIdGenerator.MAX_MACHINE_ID
    ) {
      throw new Error(
        `machineId must be an integer between 0 and ${SnowflakeIdGenerator.MAX_MACHINE_ID}`,
      );
    }
    this.machineId = BigInt(machineId);
  }

  /** Returns the next unique, monotonically increasing id as a decimal string. */
  nextId(): string {
    let timestamp = SnowflakeIdGenerator.now();

    if (timestamp < SnowflakeIdGenerator.EPOCH) {
      throw new Error(
        'System clock is set before the Snowflake epoch (2024-01-01T00:00:00.000Z); refusing to generate a negative id',
      );
    }

    if (timestamp < this.lastTimestamp) {
      throw new Error(
        'Clock moved backwards; refusing to generate a Snowflake id',
      );
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & SnowflakeIdGenerator.MAX_SEQUENCE;
      if (this.sequence === 0n) {
        timestamp = this.waitNextMillis(timestamp);
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;

    const id =
      ((timestamp - SnowflakeIdGenerator.EPOCH) <<
        (SnowflakeIdGenerator.MACHINE_ID_BITS +
          SnowflakeIdGenerator.SEQUENCE_BITS)) |
      (this.machineId << SnowflakeIdGenerator.SEQUENCE_BITS) |
      this.sequence;

    return id.toString();
  }

  private static now(): bigint {
    return BigInt(Date.now());
  }

  private waitNextMillis(current: bigint): bigint {
    let timestamp = SnowflakeIdGenerator.now();
    while (timestamp <= current) {
      timestamp = SnowflakeIdGenerator.now();
    }
    return timestamp;
  }
}

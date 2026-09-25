import { SnowflakeIdGenerator } from './snowflake-id.generator';

const MACHINE_ID_BITS = 10n;
const SEQUENCE_BITS = 12n;

function decodeMachineId(id: string): bigint {
  return (BigInt(id) >> SEQUENCE_BITS) & ((1n << MACHINE_ID_BITS) - 1n);
}

describe('SnowflakeIdGenerator', () => {
  it('generates unique, monotonically increasing ids across repeated calls', () => {
    const generator = new SnowflakeIdGenerator(1);
    const ids = Array.from({ length: 200 }, () => BigInt(generator.nextId()));

    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    }
  });

  it('encodes the constructor machineId into every generated id', () => {
    const generator = new SnowflakeIdGenerator(7);

    for (let i = 0; i < 5; i++) {
      const id = generator.nextId();
      expect(decodeMachineId(id)).toBe(7n);
    }
  });

  it('rejects a negative machineId', () => {
    expect(() => new SnowflakeIdGenerator(-1)).toThrow();
  });

  it('rejects a machineId above the 10-bit range (1023)', () => {
    expect(() => new SnowflakeIdGenerator(1024)).toThrow();
  });

  it('rejects a non-integer machineId', () => {
    expect(() => new SnowflakeIdGenerator(1.5)).toThrow();
  });

  it('accepts machineId at the boundaries of the valid range', () => {
    expect(() => new SnowflakeIdGenerator(0)).not.toThrow();
    expect(() => new SnowflakeIdGenerator(1023)).not.toThrow();
  });
});

import { DutchLimitOrderBuilder } from './dutchLimit';

describe('DutchLimitOrderBuilder', () => {
  let builder: DutchLimitOrderBuilder;

  beforeEach(() => {
    builder = new DutchLimitOrderBuilder(1);
  });

  it('Deadline already passed', () => {
    expect(() => builder.deadline(1234)).toThrow(
      'Deadline must be in the future: 1234'
    );
  });

  it('Start time must be before endTime', () => {
    expect(() => builder.endTime(1234).startTime(1235)).toThrow(
      'startTime must be before endTime: 1235'
    );
  });

  it('Start time must be before deadline', () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    builder.deadline(deadline);
    expect(() => builder.startTime(deadline + 1)).toThrow(
      `startTime must be before deadline: ${deadline + 1}`
    );
  });

  it('End time must be after deadline', () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    builder.deadline(deadline);
    expect(() => builder.endTime(deadline + 1)).toThrow(
      `endTime must be before deadline: ${deadline + 1}`
    );
  });

  it('End time equals deadline passes', () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    builder.deadline(deadline);
    builder.endTime(deadline);
  });

  it('Unknown chainId', () => {
    const chainId = 99999999;
    expect(() => new DutchLimitOrderBuilder(chainId)).toThrow(
      `Missing configuration for reactor: ${chainId}`
    );
  });
});

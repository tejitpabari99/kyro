import { formatRestSeconds, restTimerSecondsOptions } from '../rest-timer-format';

describe('restTimerSecondsOptions', () => {
  it('steps 5 s from 5 to 60, then 15 s from 75 to 300 (02 §3)', () => {
    const options = restTimerSecondsOptions();
    expect(options.slice(0, 12)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(options.slice(12)).toEqual([75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300]);
    expect(options[options.length - 1]).toBe(300);
  });
});

describe('formatRestSeconds', () => {
  it('renders "Off" for null', () => {
    expect(formatRestSeconds(null)).toBe('Off');
  });

  it('renders bare seconds under a minute', () => {
    expect(formatRestSeconds(45)).toBe('45s');
  });

  it('renders whole minutes with no seconds remainder', () => {
    expect(formatRestSeconds(120)).toBe('2min');
  });

  it('renders "2min 30s" per 02 §3\'s own example', () => {
    expect(formatRestSeconds(150)).toBe('2min 30s');
  });
});

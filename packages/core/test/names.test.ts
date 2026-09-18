import { describe, expect, it } from 'vitest';
import { demoScore, noteName, noteNames } from '../src/index.ts';

describe('note names', () => {
  it('names a note in each system with the accidental it sounds with', () => {
    expect(noteName('A', 'koron', 'persian')).toBe('لا کرن');
    expect(noteName('F', 'sharp', 'persian')).toBe('فا دیز');
    expect(noteName('C', 'sori', 'solfege')).toBe('Do sori');
    expect(noteName('B', 'flat', 'letters')).toBe('B♭');
    expect(noteName('G', undefined, 'persian')).toBe('سل');
  });

  it('takes accidentals from the key signature and skips rests and tie continuations', () => {
    const names = noteNames(demoScore, 'persian');
    expect(names.get('e2')).toBe('لا کرن'); // A koron from the key
    expect(names.get('e3')).toBe('سی بمل'); // B flat from the key
    expect(names.get('e16')).toBe('دو سری'); // written sori
    expect(names.has('e6')).toBe(false); // tied continuation
    expect(names.has('e15')).toBe(false); // rest
  });
});

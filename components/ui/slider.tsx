'use client';

import * as React from 'react';

export function Slider(props: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="range"
      className="w-full accent-zinc-900 dark:accent-zinc-50"
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step}
      onChange={(e) => props.onChange(Number(e.target.value))}
    />
  );
}


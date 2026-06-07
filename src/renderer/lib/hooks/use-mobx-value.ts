import { reaction } from 'mobx';
import { useEffect, useState } from 'react';

export function useMobxValue<T>(selector: () => T): T {
  const [value, setValue] = useState(selector);

  useEffect(
    () =>
      reaction(selector, (next) => {
        setValue(next);
      }),
    [selector]
  );

  return value;
}

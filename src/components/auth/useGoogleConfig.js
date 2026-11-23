import { useEffect, useState } from 'react';
import { useApi } from '../../context/ApiContext';

const OFF = { enabled: false, clientId: null };
let known = null; // the server's answer, remembered for the life of the page (failures are not remembered)

/** Asks the server whether Google sign-in is configured. `enabled` is false until it says yes. */
export function useGoogleConfig() {
  const { api } = useApi();
  const [config, setConfig] = useState(known ?? OFF);

  useEffect(() => {
    if (known) return undefined;
    let cancelled = false;
    api.auth.getGoogleConfig()
      .then((answer) => {
        known = answer;
        if (!cancelled) setConfig(answer);
      })
      .catch(() => { /* server unreachable: keep the button hidden, the password form still works */ });
    return () => { cancelled = true; };
  }, [api]);

  return config;
}

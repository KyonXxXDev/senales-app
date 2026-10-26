import { useContext, useEffect, useRef, useState } from 'react';
import { LoaderCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { ThemeContext } from '../../../context/ThemeContext';

/**
 * Señalética (microservicio) embebida dentro del ERP.
 * - Se sirve en el MISMO dominio por nginx (/senales/), así comparte la sesión
 *   del ERP (cookie access_token + hrms_token) sin otro login.
 * - El tema del ERP se envía al iframe cuando cambia.
 */
const BASE = import.meta.env.VITE_SENALETICA_URL || '/senales/';

export function SenaleticaPage() {
  const ref = useRef(null);
  const [cargando, setCargando] = useState(true);
  const { theme } = useContext(ThemeContext) || {};

  useEffect(() => {
    ref.current?.contentWindow?.postMessage({ tipo: 'senales:tema', tema: theme }, window.location.origin);
  }, [theme, cargando]);

  const recargar = () => {
    setCargando(true);
    ref.current?.contentWindow?.location.reload();
  };

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-9rem)] min-h-[520px]">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Señalética</h1>
        <div className="flex gap-1">
          <button type="button" className="btn btn-ghost btn-sm" onClick={recargar} title="Recargar">
            <RefreshCw className="size-4" />
          </button>
          <a className="btn btn-ghost btn-sm" href={BASE} target="_blank" rel="noopener" title="Abrir en otra pestaña">
            <ExternalLink className="size-4" />
          </a>
        </div>
      </div>
      <div className="relative flex-1 rounded-box overflow-hidden border border-base-300 bg-base-100">
        {cargando && (
          <div className="absolute inset-0 grid place-items-center">
            <LoaderCircle className="size-10 animate-spin opacity-60" />
          </div>
        )}
        <iframe
          ref={ref}
          src={BASE}
          title="Señalética"
          className="w-full h-full"
          onLoad={() => setCargando(false)}
        />
      </div>
    </div>
  );
}

export default SenaleticaPage;
